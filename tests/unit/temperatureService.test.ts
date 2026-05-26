import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma before importing the module under test
vi.mock('@server/config/database', () => ({
  prisma: {
    warehouseZone: {
      findMany: vi.fn(),
    },
    temperatureReading: {
      create: vi.fn(),
    },
  },
}));

// Mock Socket.IO before importing the module under test
vi.mock('@server/index', () => ({
  io: {
    emit: vi.fn(),
  },
}));

import { prisma } from '@server/config/database';
import { io } from '@server/index';
import {
  pollSensors,
  startTemperaturePolling,
  stopTemperaturePolling,
  isPollingActive,
} from '@server/modules/temperature/temperature.service';
import { SAFE_TEMP_LIMIT } from '@server/modules/temperature/breachDetector';

const mockedZoneFindMany = vi.mocked(prisma.warehouseZone.findMany);
const mockedReadingCreate = vi.mocked(prisma.temperatureReading.create);
const mockedIoEmit = vi.mocked(io.emit);

describe('TemperatureService - pollSensors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no cold_chain zones exist', async () => {
    mockedZoneFindMany.mockResolvedValue([]);

    const result = await pollSensors();

    expect(result).toEqual([]);
    expect(mockedZoneFindMany).toHaveBeenCalledWith({
      where: { zone_type: 'cold_chain' },
    });
    expect(mockedReadingCreate).not.toHaveBeenCalled();
  });

  it('should create a reading for each cold_chain zone', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
      { id: 'zone-2', name: 'Cold Room B', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-B' },
      { id: 'zone-3', name: 'Cold Room C', zone_type: 'cold_chain', temperature_min: -25, temperature_max: -4, block_identifier: 'CC-C' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    mockedReadingCreate.mockImplementation(async ({ data }: any) => ({
      id: `reading-${data.zone_id}`,
      zone_id: data.zone_id,
      temperature_celsius: data.temperature_celsius,
      is_breach: data.is_breach,
      recorded_at: data.recorded_at,
    }));

    const result = await pollSensors();

    expect(result).toHaveLength(3);
    expect(mockedReadingCreate).toHaveBeenCalledTimes(3);

    // Verify each reading corresponds to a zone
    const zoneIds = result.map((r) => r.zone_id);
    expect(zoneIds).toContain('zone-1');
    expect(zoneIds).toContain('zone-2');
    expect(zoneIds).toContain('zone-3');
  });

  it('should generate temperatures between -25 and 0', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    mockedReadingCreate.mockImplementation(async ({ data }: any) => ({
      id: 'reading-1',
      zone_id: data.zone_id,
      temperature_celsius: data.temperature_celsius,
      is_breach: data.is_breach,
      recorded_at: data.recorded_at,
    }));

    const result = await pollSensors();

    expect(result).toHaveLength(1);
    expect(result[0].temperature_celsius).toBeGreaterThanOrEqual(-25);
    expect(result[0].temperature_celsius).toBeLessThanOrEqual(0);
  });

  it('should mark reading as breach when temperature > SAFE_TEMP_LIMIT', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    // Capture the data passed to create to verify breach logic
    mockedReadingCreate.mockImplementation(async ({ data }: any) => ({
      id: 'reading-1',
      zone_id: data.zone_id,
      temperature_celsius: data.temperature_celsius,
      is_breach: data.is_breach,
      recorded_at: data.recorded_at,
    }));

    const result = await pollSensors();

    // Verify breach flag is consistent with temperature
    const reading = result[0];
    if (reading.temperature_celsius > SAFE_TEMP_LIMIT) {
      expect(reading.is_breach).toBe(true);
    } else {
      expect(reading.is_breach).toBe(false);
    }
  });

  it('should pass correct data structure to prisma create', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    mockedReadingCreate.mockImplementation(async ({ data }: any) => ({
      id: 'reading-1',
      zone_id: data.zone_id,
      temperature_celsius: data.temperature_celsius,
      is_breach: data.is_breach,
      recorded_at: data.recorded_at,
    }));

    await pollSensors();

    expect(mockedReadingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        zone_id: 'zone-1',
        temperature_celsius: expect.any(Number),
        is_breach: expect.any(Boolean),
        recorded_at: expect.any(Date),
      }),
    });
  });
});

describe('TemperatureService - startTemperaturePolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Ensure polling is stopped before each test
    stopTemperaturePolling();
    // Mock zones to prevent actual DB calls
    mockedZoneFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    stopTemperaturePolling();
    vi.useRealTimers();
  });

  it('should set up an interval that polls sensors', async () => {
    startTemperaturePolling(60000);

    expect(isPollingActive()).toBe(true);

    // The initial poll is called immediately
    expect(mockedZoneFindMany).toHaveBeenCalledTimes(1);

    // Advance time by 60 seconds
    await vi.advanceTimersByTimeAsync(60000);

    // Should have been called again
    expect(mockedZoneFindMany).toHaveBeenCalledTimes(2);
  });

  it('should use configurable interval', async () => {
    startTemperaturePolling(30000);

    expect(isPollingActive()).toBe(true);

    // Advance by 30s - should trigger
    await vi.advanceTimersByTimeAsync(30000);
    expect(mockedZoneFindMany).toHaveBeenCalledTimes(2); // 1 immediate + 1 interval

    // Advance another 30s
    await vi.advanceTimersByTimeAsync(30000);
    expect(mockedZoneFindMany).toHaveBeenCalledTimes(3);
  });

  it('should stop existing polling before starting new one', async () => {
    startTemperaturePolling(60000);
    expect(isPollingActive()).toBe(true);

    // Start again with different interval
    startTemperaturePolling(30000);
    expect(isPollingActive()).toBe(true);

    // Advance 30s - should trigger with new interval
    await vi.advanceTimersByTimeAsync(30000);
    // 1 from first start + 1 from second start + 1 from interval
    expect(mockedZoneFindMany).toHaveBeenCalledTimes(3);
  });
});

describe('TemperatureService - stopTemperaturePolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockedZoneFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    stopTemperaturePolling();
    vi.useRealTimers();
  });

  it('should clear the interval and stop polling', async () => {
    startTemperaturePolling(60000);
    expect(isPollingActive()).toBe(true);

    stopTemperaturePolling();
    expect(isPollingActive()).toBe(false);

    // Advance time - should NOT trigger additional polls
    const callCountAfterStop = mockedZoneFindMany.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(mockedZoneFindMany).toHaveBeenCalledTimes(callCountAfterStop);
  });

  it('should be safe to call when no polling is active', () => {
    expect(isPollingActive()).toBe(false);
    expect(() => stopTemperaturePolling()).not.toThrow();
    expect(isPollingActive()).toBe(false);
  });
});

describe('BreachDetector - SAFE_TEMP_LIMIT', () => {
  it('should export SAFE_TEMP_LIMIT as -4.0', () => {
    expect(SAFE_TEMP_LIMIT).toBe(-4.0);
  });
});

describe('TemperatureService - WebSocket emissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should emit temperature:update event with readings after polling', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    mockedReadingCreate.mockImplementation(async ({ data }: any) => ({
      id: 'reading-1',
      zone_id: data.zone_id,
      temperature_celsius: data.temperature_celsius,
      is_breach: data.is_breach,
      recorded_at: data.recorded_at,
    }));

    const result = await pollSensors();

    expect(mockedIoEmit).toHaveBeenCalledWith('temperature:update', { readings: result });
  });

  it('should emit temperature:breach event when a reading is a breach', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    // Force a breach temperature
    mockedReadingCreate.mockImplementation(async ({ data }: any) => ({
      id: 'reading-1',
      zone_id: data.zone_id,
      temperature_celsius: -2.0, // Above -4.0, so it's a breach
      is_breach: true,
      recorded_at: data.recorded_at,
    }));

    await pollSensors();

    // Should emit temperature:breach with zone details
    expect(mockedIoEmit).toHaveBeenCalledWith('temperature:breach', expect.objectContaining({
      zoneId: 'zone-1',
      zoneName: 'Cold Room A',
      temperature: -2.0,
      safeLimit: SAFE_TEMP_LIMIT,
      timestamp: expect.any(Date),
    }));
  });

  it('should NOT emit temperature:breach when no readings are breaches', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    // Force a safe temperature
    mockedReadingCreate.mockImplementation(async ({ data }: any) => ({
      id: 'reading-1',
      zone_id: data.zone_id,
      temperature_celsius: -10.0, // Below -4.0, safe
      is_breach: false,
      recorded_at: data.recorded_at,
    }));

    await pollSensors();

    // Should emit temperature:update but NOT temperature:breach
    expect(mockedIoEmit).toHaveBeenCalledWith('temperature:update', expect.any(Object));
    expect(mockedIoEmit).not.toHaveBeenCalledWith('temperature:breach', expect.any(Object));
  });

  it('should not emit any events when no cold_chain zones exist', async () => {
    mockedZoneFindMany.mockResolvedValue([]);

    await pollSensors();

    expect(mockedIoEmit).not.toHaveBeenCalled();
  });
});
