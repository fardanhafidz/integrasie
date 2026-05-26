import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkBreach,
  isBreachResolved,
  detectSensorFailure,
  formatBreachAlert,
  SAFE_TEMP_LIMIT,
  BREACH_RESOLUTION_COUNT,
  DEFAULT_SENSOR_FAILURE_GAP_MS,
  MAX_ALERT_LENGTH,
} from '@server/modules/temperature/breachDetector';

// Mock the Prisma client
vi.mock('@server/config/database', () => ({
  prisma: {
    temperatureReading: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@server/config/database';

describe('breachDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constants', () => {
    it('SAFE_TEMP_LIMIT should be -4.0', () => {
      expect(SAFE_TEMP_LIMIT).toBe(-4.0);
    });

    it('BREACH_RESOLUTION_COUNT should be 3', () => {
      expect(BREACH_RESOLUTION_COUNT).toBe(3);
    });

    it('DEFAULT_SENSOR_FAILURE_GAP_MS should be 120000', () => {
      expect(DEFAULT_SENSOR_FAILURE_GAP_MS).toBe(120_000);
    });
  });

  describe('checkBreach', () => {
    describe('returns true for temperatures above -4.0°C (breach)', () => {
      it('returns true for -3.9°C', () => {
        expect(checkBreach(-3.9)).toBe(true);
      });

      it('returns true for 0°C', () => {
        expect(checkBreach(0)).toBe(true);
      });

      it('returns true for 5°C', () => {
        expect(checkBreach(5)).toBe(true);
      });

      it('returns true for 10°C', () => {
        expect(checkBreach(10)).toBe(true);
      });
    });

    describe('returns false for temperatures at or below -4.0°C (safe)', () => {
      it('returns false for -4.0°C (boundary: > -4.0 is breach, not >=)', () => {
        expect(checkBreach(-4.0)).toBe(false);
      });

      it('returns false for -4.1°C', () => {
        expect(checkBreach(-4.1)).toBe(false);
      });

      it('returns false for -10°C', () => {
        expect(checkBreach(-10)).toBe(false);
      });

      it('returns false for -20°C', () => {
        expect(checkBreach(-20)).toBe(false);
      });
    });
  });

  describe('isBreachResolved', () => {
    const mockFindMany = prisma.temperatureReading.findMany as ReturnType<typeof vi.fn>;

    it('returns true when last 3 readings are all at or below -4.0°C', async () => {
      mockFindMany.mockResolvedValue([
        { temperature_celsius: -5.0, recorded_at: new Date() },
        { temperature_celsius: -4.0, recorded_at: new Date() },
        { temperature_celsius: -6.0, recorded_at: new Date() },
      ]);

      const result = await isBreachResolved('zone-1');
      expect(result).toBe(true);
    });

    it('returns false when any of the last 3 readings exceeds -4.0°C', async () => {
      mockFindMany.mockResolvedValue([
        { temperature_celsius: -5.0, recorded_at: new Date() },
        { temperature_celsius: -3.5, recorded_at: new Date() }, // breach
        { temperature_celsius: -6.0, recorded_at: new Date() },
      ]);

      const result = await isBreachResolved('zone-1');
      expect(result).toBe(false);
    });

    it('returns false when fewer than 3 readings exist', async () => {
      mockFindMany.mockResolvedValue([
        { temperature_celsius: -5.0, recorded_at: new Date() },
        { temperature_celsius: -4.0, recorded_at: new Date() },
      ]);

      const result = await isBreachResolved('zone-1');
      expect(result).toBe(false);
    });

    it('returns false when no readings exist', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await isBreachResolved('zone-1');
      expect(result).toBe(false);
    });

    it('returns true when all 3 readings are exactly -4.0°C (boundary)', async () => {
      mockFindMany.mockResolvedValue([
        { temperature_celsius: -4.0, recorded_at: new Date() },
        { temperature_celsius: -4.0, recorded_at: new Date() },
        { temperature_celsius: -4.0, recorded_at: new Date() },
      ]);

      const result = await isBreachResolved('zone-1');
      expect(result).toBe(true);
    });

    it('queries the correct zone with proper ordering and limit', async () => {
      mockFindMany.mockResolvedValue([]);

      await isBreachResolved('zone-abc');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { zone_id: 'zone-abc' },
        orderBy: { recorded_at: 'desc' },
        take: 3,
      });
    });
  });

  describe('detectSensorFailure', () => {
    const mockFindFirst = prisma.temperatureReading.findFirst as ReturnType<typeof vi.fn>;

    it('returns true when no readings exist for the zone', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await detectSensorFailure('zone-1');
      expect(result).toBe(true);
    });

    it('returns true when last reading is older than 120 seconds', async () => {
      const oldDate = new Date(Date.now() - 130_000); // 130 seconds ago
      mockFindFirst.mockResolvedValue({
        recorded_at: oldDate,
      });

      const result = await detectSensorFailure('zone-1');
      expect(result).toBe(true);
    });

    it('returns false when last reading is within 120 seconds', async () => {
      const recentDate = new Date(Date.now() - 60_000); // 60 seconds ago
      mockFindFirst.mockResolvedValue({
        recorded_at: recentDate,
      });

      const result = await detectSensorFailure('zone-1');
      expect(result).toBe(false);
    });

    it('returns false when last reading is exactly now', async () => {
      mockFindFirst.mockResolvedValue({
        recorded_at: new Date(),
      });

      const result = await detectSensorFailure('zone-1');
      expect(result).toBe(false);
    });

    it('accepts a custom maxGapMs parameter', async () => {
      const oldDate = new Date(Date.now() - 50_000); // 50 seconds ago
      mockFindFirst.mockResolvedValue({
        recorded_at: oldDate,
      });

      // With default 120s gap, this should be fine
      const resultDefault = await detectSensorFailure('zone-1');
      expect(resultDefault).toBe(false);

      // With custom 30s gap, this should be a failure
      const resultCustom = await detectSensorFailure('zone-1', 30_000);
      expect(resultCustom).toBe(true);
    });

    it('queries the correct zone with proper ordering', async () => {
      mockFindFirst.mockResolvedValue(null);

      await detectSensorFailure('zone-xyz');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { zone_id: 'zone-xyz' },
        orderBy: { recorded_at: 'desc' },
      });
    });
  });

  describe('formatBreachAlert', () => {
    it('MAX_ALERT_LENGTH should be 1000', () => {
      expect(MAX_ALERT_LENGTH).toBe(1000);
    });

    it('formats alert with zone name, zone id, current temperature, and safe limit', () => {
      const result = formatBreachAlert('Cold Room A', 'zone-001', -2.5);

      expect(result).toContain('🚨 TEMPERATURE BREACH');
      expect(result).toContain('Zone: Cold Room A (zone-001)');
      expect(result).toContain('Current: -2.5°C');
      expect(result).toContain('Safe Limit: -4.0°C');
      expect(result).toContain('Action Required: Investigate immediately');
    });

    it('includes all required components separated by newlines', () => {
      const result = formatBreachAlert('Zone B', 'zone-002', 1.3);
      const lines = result.split('\n');

      expect(lines).toHaveLength(5);
      expect(lines[0]).toBe('🚨 TEMPERATURE BREACH');
      expect(lines[1]).toBe('Zone: Zone B (zone-002)');
      expect(lines[2]).toBe('Current: 1.3°C');
      expect(lines[3]).toBe('Safe Limit: -4.0°C');
      expect(lines[4]).toBe('Action Required: Investigate immediately');
    });

    it('message length is ≤1000 characters for typical inputs', () => {
      const result = formatBreachAlert('Cold Chain Storage Zone Alpha', 'zone-abc-123', -1.5);
      expect(result.length).toBeLessThanOrEqual(1000);
    });

    it('message length is ≤1000 characters even with very long zone names', () => {
      const longZoneName = 'A'.repeat(500);
      const longZoneId = 'B'.repeat(500);
      const result = formatBreachAlert(longZoneName, longZoneId, 99.99);
      expect(result.length).toBeLessThanOrEqual(1000);
    });

    it('handles positive temperature values', () => {
      const result = formatBreachAlert('Zone C', 'zone-003', 5.0);
      expect(result).toContain('Current: 5°C');
    });

    it('handles zero temperature', () => {
      const result = formatBreachAlert('Zone D', 'zone-004', 0);
      expect(result).toContain('Current: 0°C');
    });

    it('handles negative temperature values close to the limit', () => {
      const result = formatBreachAlert('Zone E', 'zone-005', -3.9);
      expect(result).toContain('Current: -3.9°C');
    });

    it('uses the SAFE_TEMP_LIMIT constant for the safe limit display', () => {
      const result = formatBreachAlert('Zone F', 'zone-006', -2.0);
      expect(result).toContain(`Safe Limit: ${SAFE_TEMP_LIMIT.toFixed(1)}°C`);
    });
  });
});
