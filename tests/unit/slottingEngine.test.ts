import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RackSlot, Lot } from '@prisma/client';

// Mock Prisma before importing the module under test
vi.mock('@server/config/database', () => ({
  prisma: {
    rackSlot: {
      findMany: vi.fn(),
    },
    warehouseZone: {
      findMany: vi.fn(),
    },
    lot: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock hazardMatrix
vi.mock('@server/modules/slotting/hazardMatrix', () => ({
  isCompatible: vi.fn(),
}));

import { getAdjacentSlots, getEligibleZones, getEligibleZoneTypes, recommendSlots, SlotCoordinate } from '@server/modules/slotting/slottingEngine';
import type { LotZoneInput } from '@server/modules/slotting/slottingEngine';
import { prisma } from '@server/config/database';
import { isCompatible } from '@server/modules/slotting/hazardMatrix';

const mockedRackSlotFindMany = vi.mocked(prisma.rackSlot.findMany);
const mockedZoneFindMany = vi.mocked(prisma.warehouseZone.findMany);
const mockedLotFindUnique = vi.mocked(prisma.lot.findUnique);
const mockedLotFindMany = vi.mocked(prisma.lot.findMany);
const mockedIsCompatible = vi.mocked(isCompatible);

function makeSlot(overrides: Partial<RackSlot> = {}): RackSlot {
  return {
    id: 'slot-id',
    zone_id: 'zone-1',
    coordinate: 'A-1-1-1',
    row: 1,
    level: 1,
    position: 1,
    status: 'available',
    current_lot_id: null,
    ...overrides,
  } as RackSlot;
}

describe('SlottingEngine - getEligibleZoneTypes', () => {
  describe('temperature-sensitive lots', () => {
    it('should return only cold_chain for temperature-sensitive lots', () => {
      const lot: LotZoneInput = { is_temperature_sensitive: true, is_hazardous: false };
      expect(getEligibleZoneTypes(lot)).toEqual(['cold_chain']);
    });

    it('should prioritize temperature-sensitive over hazardous (both true)', () => {
      const lot: LotZoneInput = { is_temperature_sensitive: true, is_hazardous: true };
      expect(getEligibleZoneTypes(lot)).toEqual(['cold_chain']);
    });
  });

  describe('hazardous lots', () => {
    it('should return hazardous and standard for hazardous (non-temp-sensitive) lots', () => {
      const lot: LotZoneInput = { is_temperature_sensitive: false, is_hazardous: true };
      expect(getEligibleZoneTypes(lot)).toEqual(['hazardous', 'standard']);
    });
  });

  describe('standard lots', () => {
    it('should return only standard for non-sensitive, non-hazardous lots', () => {
      const lot: LotZoneInput = { is_temperature_sensitive: false, is_hazardous: false };
      expect(getEligibleZoneTypes(lot)).toEqual(['standard']);
    });
  });
});

describe('SlottingEngine - getEligibleZones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should query cold_chain zones for temperature-sensitive lots', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    const lot: LotZoneInput = { is_temperature_sensitive: true, is_hazardous: false };
    const result = await getEligibleZones(lot);

    expect(mockedZoneFindMany).toHaveBeenCalledWith({
      where: {
        zone_type: {
          in: ['cold_chain'],
        },
      },
    });
    expect(result).toEqual(mockZones);
  });

  it('should query hazardous and standard zones for hazardous lots', async () => {
    const mockZones = [
      { id: 'zone-2', name: 'Hazardous Zone', zone_type: 'hazardous', temperature_min: null, temperature_max: null, block_identifier: 'HZ-A' },
      { id: 'zone-3', name: 'Standard Zone', zone_type: 'standard', temperature_min: null, temperature_max: null, block_identifier: 'ST-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    const lot: LotZoneInput = { is_temperature_sensitive: false, is_hazardous: true };
    const result = await getEligibleZones(lot);

    expect(mockedZoneFindMany).toHaveBeenCalledWith({
      where: {
        zone_type: {
          in: ['hazardous', 'standard'],
        },
      },
    });
    expect(result).toEqual(mockZones);
  });

  it('should query only standard zones for regular lots', async () => {
    const mockZones = [
      { id: 'zone-3', name: 'Standard Zone', zone_type: 'standard', temperature_min: null, temperature_max: null, block_identifier: 'ST-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    const lot: LotZoneInput = { is_temperature_sensitive: false, is_hazardous: false };
    const result = await getEligibleZones(lot);

    expect(mockedZoneFindMany).toHaveBeenCalledWith({
      where: {
        zone_type: {
          in: ['standard'],
        },
      },
    });
    expect(result).toEqual(mockZones);
  });

  it('should return empty array when no matching zones exist', async () => {
    mockedZoneFindMany.mockResolvedValue([]);

    const lot: LotZoneInput = { is_temperature_sensitive: true, is_hazardous: false };
    const result = await getEligibleZones(lot);

    expect(result).toEqual([]);
  });

  it('should query cold_chain zones when lot is both temperature-sensitive and hazardous', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Cold Room A', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' },
    ];
    mockedZoneFindMany.mockResolvedValue(mockZones as any);

    const lot: LotZoneInput = { is_temperature_sensitive: true, is_hazardous: true };
    const result = await getEligibleZones(lot);

    expect(mockedZoneFindMany).toHaveBeenCalledWith({
      where: {
        zone_type: {
          in: ['cold_chain'],
        },
      },
    });
    expect(result).toEqual(mockZones);
  });
});

describe('SlottingEngine - getAdjacentSlots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should query for left, right, above, and below slots within the same zone and row', async () => {
    mockedRackSlotFindMany.mockResolvedValue([]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 2, level: 3, position: 4 };
    await getAdjacentSlots(slot);

    expect(mockedRackSlotFindMany).toHaveBeenCalledOnce();
    expect(mockedRackSlotFindMany).toHaveBeenCalledWith({
      where: {
        zone_id: 'zone-1',
        row: 2,
        OR: [
          { level: 3, position: 3 },  // left
          { level: 3, position: 5 },  // right
          { level: 2, position: 4 },  // below
          { level: 4, position: 4 },  // above
        ],
      },
    });
  });

  it('should return all 4 adjacent slots when they exist (middle of grid)', async () => {
    const leftSlot = makeSlot({ id: 'left', position: 3, level: 3, row: 2 });
    const rightSlot = makeSlot({ id: 'right', position: 5, level: 3, row: 2 });
    const belowSlot = makeSlot({ id: 'below', position: 4, level: 2, row: 2 });
    const aboveSlot = makeSlot({ id: 'above', position: 4, level: 4, row: 2 });

    mockedRackSlotFindMany.mockResolvedValue([leftSlot, rightSlot, belowSlot, aboveSlot]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 2, level: 3, position: 4 };
    const result = await getAdjacentSlots(slot);

    expect(result).toHaveLength(4);
    expect(result).toContainEqual(leftSlot);
    expect(result).toContainEqual(rightSlot);
    expect(result).toContainEqual(belowSlot);
    expect(result).toContainEqual(aboveSlot);
  });

  it('should return 0 slots when at a corner with no neighbors', async () => {
    mockedRackSlotFindMany.mockResolvedValue([]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 1, level: 1, position: 1 };
    const result = await getAdjacentSlots(slot);

    expect(result).toHaveLength(0);
  });

  it('should return 2 slots for an edge position (e.g., bottom-left corner with right and above)', async () => {
    const rightSlot = makeSlot({ id: 'right', position: 2, level: 1, row: 1 });
    const aboveSlot = makeSlot({ id: 'above', position: 1, level: 2, row: 1 });

    mockedRackSlotFindMany.mockResolvedValue([rightSlot, aboveSlot]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 1, level: 1, position: 1 };
    const result = await getAdjacentSlots(slot);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual(rightSlot);
    expect(result).toContainEqual(aboveSlot);
  });

  it('should return 3 slots for an edge position (e.g., bottom row, middle position)', async () => {
    const leftSlot = makeSlot({ id: 'left', position: 2, level: 1, row: 1 });
    const rightSlot = makeSlot({ id: 'right', position: 4, level: 1, row: 1 });
    const aboveSlot = makeSlot({ id: 'above', position: 3, level: 2, row: 1 });

    mockedRackSlotFindMany.mockResolvedValue([leftSlot, rightSlot, aboveSlot]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 1, level: 1, position: 3 };
    const result = await getAdjacentSlots(slot);

    expect(result).toHaveLength(3);
  });

  it('should only return slots from the same zone', async () => {
    mockedRackSlotFindMany.mockResolvedValue([]);

    const slot: SlotCoordinate = { zone_id: 'zone-A', row: 1, level: 2, position: 2 };
    await getAdjacentSlots(slot);

    const callArgs = mockedRackSlotFindMany.mock.calls[0][0];
    expect(callArgs?.where?.zone_id).toBe('zone-A');
  });

  it('should only return slots from the same row', async () => {
    mockedRackSlotFindMany.mockResolvedValue([]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 5, level: 2, position: 2 };
    await getAdjacentSlots(slot);

    const callArgs = mockedRackSlotFindMany.mock.calls[0][0];
    expect(callArgs?.where?.row).toBe(5);
  });

  it('should handle position 1 (leftmost) correctly - no negative position query issue', async () => {
    mockedRackSlotFindMany.mockResolvedValue([]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 1, level: 1, position: 1 };
    await getAdjacentSlots(slot);

    const callArgs = mockedRackSlotFindMany.mock.calls[0][0];
    expect(callArgs?.where?.OR).toContainEqual({ level: 1, position: 0 });
    expect(callArgs?.where?.OR).toContainEqual({ level: 1, position: 2 });
  });

  it('should handle level 1 (bottom) correctly - no negative level query issue', async () => {
    mockedRackSlotFindMany.mockResolvedValue([]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 1, level: 1, position: 3 };
    await getAdjacentSlots(slot);

    const callArgs = mockedRackSlotFindMany.mock.calls[0][0];
    expect(callArgs?.where?.OR).toContainEqual({ level: 0, position: 3 });
    expect(callArgs?.where?.OR).toContainEqual({ level: 2, position: 3 });
  });

  it('should return slots with various statuses (available, occupied, reserved, maintenance)', async () => {
    const availableSlot = makeSlot({ id: 'avail', status: 'available', position: 2 });
    const occupiedSlot = makeSlot({ id: 'occ', status: 'occupied', position: 4 });
    const reservedSlot = makeSlot({ id: 'res', status: 'reserved', level: 2 });
    const maintenanceSlot = makeSlot({ id: 'maint', status: 'maintenance', level: 0 });

    mockedRackSlotFindMany.mockResolvedValue([availableSlot, occupiedSlot, reservedSlot, maintenanceSlot]);

    const slot: SlotCoordinate = { zone_id: 'zone-1', row: 1, level: 1, position: 3 };
    const result = await getAdjacentSlots(slot);

    expect(result).toHaveLength(4);
    expect(result.map(s => s.status)).toContain('available');
    expect(result.map(s => s.status)).toContain('occupied');
    expect(result.map(s => s.status)).toContain('reserved');
    expect(result.map(s => s.status)).toContain('maintenance');
  });
});

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 'lot-1',
    lot_number: 'RM-20240101-0001',
    supplier_intake_id: 'intake-1',
    status: 'ready_to_store',
    material_group_code: 'RM',
    is_temperature_sensitive: false,
    is_hazardous: false,
    hazard_class: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Lot;
}

describe('SlottingEngine - recommendSlots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error when lot is not found', async () => {
    mockedLotFindUnique.mockResolvedValue(null);

    await expect(recommendSlots('non-existent-lot')).rejects.toThrow(
      'Lot not found: non-existent-lot'
    );
  });

  it('should throw error when lot status is not ready_to_store', async () => {
    mockedLotFindUnique.mockResolvedValue(makeLot({ id: 'lot-1', status: 'pending_qc' }));

    await expect(recommendSlots('lot-1')).rejects.toThrow(
      'Lot lot-1 is not ready to store (current status: pending_qc)'
    );
  });

  it('should return empty array when no eligible zones exist', async () => {
    mockedLotFindUnique.mockResolvedValue(makeLot());
    mockedZoneFindMany.mockResolvedValue([]);

    const result = await recommendSlots('lot-1');
    expect(result).toEqual([]);
  });

  it('should return empty array when no available slots in eligible zones', async () => {
    mockedLotFindUnique.mockResolvedValue(makeLot());
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-1', name: 'Standard A', zone_type: 'standard', temperature_min: null, temperature_max: null, block_identifier: 'ST-A' } as any,
    ]);
    // First call: available slots query returns empty
    mockedRackSlotFindMany.mockResolvedValueOnce([]);

    const result = await recommendSlots('lot-1');
    expect(result).toEqual([]);
  });

  it('should return up to 5 slots for a standard lot with available slots', async () => {
    mockedLotFindUnique.mockResolvedValue(makeLot());
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-1', name: 'Standard A', zone_type: 'standard', temperature_min: null, temperature_max: null, block_identifier: 'ST-A' } as any,
    ]);

    const slots = Array.from({ length: 10 }, (_, i) =>
      makeSlot({ id: `slot-${i}`, zone_id: 'zone-1', row: 1, level: 1, position: i + 1 })
    );

    // First call: available slots in eligible zones
    mockedRackSlotFindMany.mockResolvedValueOnce(slots);
    // Second call: existing lot slots for proximity (none)
    mockedRackSlotFindMany.mockResolvedValueOnce([]);

    const result = await recommendSlots('lot-1');
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should return at most MAX_RECOMMENDATIONS (5) slots', async () => {
    mockedLotFindUnique.mockResolvedValue(makeLot());
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-1', name: 'Standard A', zone_type: 'standard', temperature_min: null, temperature_max: null, block_identifier: 'ST-A' } as any,
    ]);

    const slots = Array.from({ length: 20 }, (_, i) =>
      makeSlot({ id: `slot-${i}`, zone_id: 'zone-1', row: 1, level: 1, position: i + 1 })
    );

    mockedRackSlotFindMany.mockResolvedValueOnce(slots);
    mockedRackSlotFindMany.mockResolvedValueOnce([]);

    const result = await recommendSlots('lot-1');
    expect(result).toHaveLength(5);
  });

  it('should filter by hazard compatibility for hazardous lots', async () => {
    const hazardousLot = makeLot({
      id: 'lot-haz',
      is_hazardous: true,
      hazard_class: 'flammable',
    });
    mockedLotFindUnique.mockResolvedValue(hazardousLot);
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-haz', name: 'Hazardous Zone', zone_type: 'hazardous', temperature_min: null, temperature_max: null, block_identifier: 'HZ-A' } as any,
    ]);

    const slot1 = makeSlot({ id: 'slot-1', zone_id: 'zone-haz', row: 1, level: 1, position: 1 });
    const slot2 = makeSlot({ id: 'slot-2', zone_id: 'zone-haz', row: 1, level: 1, position: 3 });

    // Available slots query
    mockedRackSlotFindMany.mockResolvedValueOnce([slot1, slot2]);

    // Adjacent slots for slot1: has an occupied neighbor with incompatible lot
    const occupiedNeighbor = makeSlot({
      id: 'neighbor-1',
      zone_id: 'zone-haz',
      row: 1,
      level: 1,
      position: 2,
      status: 'occupied',
      current_lot_id: 'lot-incompatible',
    });
    mockedRackSlotFindMany.mockResolvedValueOnce([occupiedNeighbor]);

    // Adjacent lots query for slot1's neighbor
    mockedLotFindMany.mockResolvedValueOnce([
      makeLot({ id: 'lot-incompatible', is_hazardous: true, hazard_class: 'oxidizer' }),
    ]);

    // isCompatible returns false for flammable + oxidizer
    mockedIsCompatible.mockResolvedValueOnce(false);

    // Adjacent slots for slot2: no occupied neighbors
    mockedRackSlotFindMany.mockResolvedValueOnce([]);

    // Proximity ranking: no existing lot slots
    mockedRackSlotFindMany.mockResolvedValueOnce([]);

    const result = await recommendSlots('lot-haz');

    // Only slot2 should be returned (slot1 is incompatible)
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('slot-2');
  });

  it('should allow hazardous lot placement when adjacent lots are compatible', async () => {
    const hazardousLot = makeLot({
      id: 'lot-haz',
      is_hazardous: true,
      hazard_class: 'flammable',
    });
    mockedLotFindUnique.mockResolvedValue(hazardousLot);
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-haz', name: 'Hazardous Zone', zone_type: 'hazardous', temperature_min: null, temperature_max: null, block_identifier: 'HZ-A' } as any,
    ]);

    const slot1 = makeSlot({ id: 'slot-1', zone_id: 'zone-haz', row: 1, level: 1, position: 1 });

    // Available slots query
    mockedRackSlotFindMany.mockResolvedValueOnce([slot1]);

    // Adjacent slots for slot1: has an occupied neighbor with compatible lot
    const occupiedNeighbor = makeSlot({
      id: 'neighbor-1',
      zone_id: 'zone-haz',
      row: 1,
      level: 1,
      position: 2,
      status: 'occupied',
      current_lot_id: 'lot-compatible',
    });
    mockedRackSlotFindMany.mockResolvedValueOnce([occupiedNeighbor]);

    // Adjacent lots query
    mockedLotFindMany.mockResolvedValueOnce([
      makeLot({ id: 'lot-compatible', is_hazardous: true, hazard_class: 'flammable' }),
    ]);

    // isCompatible returns true for same class
    mockedIsCompatible.mockResolvedValueOnce(true);

    // Proximity ranking: no existing lot slots
    mockedRackSlotFindMany.mockResolvedValueOnce([]);

    const result = await recommendSlots('lot-haz');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('slot-1');
  });

  it('should rank slots by proximity to existing drums from same lot', async () => {
    mockedLotFindUnique.mockResolvedValue(makeLot({ id: 'lot-1' }));
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-1', name: 'Standard A', zone_type: 'standard', temperature_min: null, temperature_max: null, block_identifier: 'ST-A' } as any,
    ]);

    // Available slots: position 1, 5, 3
    const slotFar = makeSlot({ id: 'slot-far', zone_id: 'zone-1', row: 1, level: 1, position: 5 });
    const slotClose = makeSlot({ id: 'slot-close', zone_id: 'zone-1', row: 1, level: 1, position: 3 });
    const slotFarthest = makeSlot({ id: 'slot-farthest', zone_id: 'zone-1', row: 1, level: 1, position: 1 });

    // Available slots query
    mockedRackSlotFindMany.mockResolvedValueOnce([slotFar, slotClose, slotFarthest]);

    // Proximity ranking: existing lot slot at position 4
    const existingSlot = makeSlot({
      id: 'existing',
      zone_id: 'zone-1',
      row: 1,
      level: 1,
      position: 4,
      status: 'occupied',
      current_lot_id: 'lot-1',
    });
    mockedRackSlotFindMany.mockResolvedValueOnce([existingSlot]);

    const result = await recommendSlots('lot-1');

    // slot-close (pos 3, distance 1) should be first, then slot-far (pos 5, distance 1), then slot-farthest (pos 1, distance 3)
    expect(result[0].id).toBe('slot-close');
    expect(result[1].id).toBe('slot-far');
    expect(result[2].id).toBe('slot-farthest');
  });

  it('should return empty array when hazardous lot has no compatible slots', async () => {
    const hazardousLot = makeLot({
      id: 'lot-haz',
      is_hazardous: true,
      hazard_class: 'flammable',
    });
    mockedLotFindUnique.mockResolvedValue(hazardousLot);
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-haz', name: 'Hazardous Zone', zone_type: 'hazardous', temperature_min: null, temperature_max: null, block_identifier: 'HZ-A' } as any,
    ]);

    const slot1 = makeSlot({ id: 'slot-1', zone_id: 'zone-haz', row: 1, level: 1, position: 1 });

    // Available slots query
    mockedRackSlotFindMany.mockResolvedValueOnce([slot1]);

    // Adjacent slots: occupied with incompatible lot
    const occupiedNeighbor = makeSlot({
      id: 'neighbor-1',
      zone_id: 'zone-haz',
      row: 1,
      level: 1,
      position: 2,
      status: 'occupied',
      current_lot_id: 'lot-incompatible',
    });
    mockedRackSlotFindMany.mockResolvedValueOnce([occupiedNeighbor]);

    mockedLotFindMany.mockResolvedValueOnce([
      makeLot({ id: 'lot-incompatible', is_hazardous: true, hazard_class: 'oxidizer' }),
    ]);

    mockedIsCompatible.mockResolvedValueOnce(false);

    const result = await recommendSlots('lot-haz');
    expect(result).toEqual([]);
  });

  it('should skip hazard check for non-hazardous adjacent lots', async () => {
    const hazardousLot = makeLot({
      id: 'lot-haz',
      is_hazardous: true,
      hazard_class: 'flammable',
    });
    mockedLotFindUnique.mockResolvedValue(hazardousLot);
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-haz', name: 'Hazardous Zone', zone_type: 'hazardous', temperature_min: null, temperature_max: null, block_identifier: 'HZ-A' } as any,
    ]);

    const slot1 = makeSlot({ id: 'slot-1', zone_id: 'zone-haz', row: 1, level: 1, position: 1 });

    // Available slots query
    mockedRackSlotFindMany.mockResolvedValueOnce([slot1]);

    // Adjacent slots: occupied with non-hazardous lot
    const occupiedNeighbor = makeSlot({
      id: 'neighbor-1',
      zone_id: 'zone-haz',
      row: 1,
      level: 1,
      position: 2,
      status: 'occupied',
      current_lot_id: 'lot-safe',
    });
    mockedRackSlotFindMany.mockResolvedValueOnce([occupiedNeighbor]);

    // Adjacent lot is non-hazardous
    mockedLotFindMany.mockResolvedValueOnce([
      makeLot({ id: 'lot-safe', is_hazardous: false, hazard_class: null }),
    ]);

    // Proximity ranking: no existing lot slots
    mockedRackSlotFindMany.mockResolvedValueOnce([]);

    const result = await recommendSlots('lot-haz');

    // Should pass because non-hazardous adjacent lots are always compatible
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('slot-1');
    // isCompatible should NOT have been called
    expect(mockedIsCompatible).not.toHaveBeenCalled();
  });

  it('should use cold_chain zones for temperature-sensitive lots', async () => {
    const tempLot = makeLot({
      id: 'lot-temp',
      is_temperature_sensitive: true,
    });
    mockedLotFindUnique.mockResolvedValue(tempLot);
    mockedZoneFindMany.mockResolvedValue([
      { id: 'zone-cold', name: 'Cold Room', zone_type: 'cold_chain', temperature_min: -20, temperature_max: -4, block_identifier: 'CC-A' } as any,
    ]);

    const coldSlot = makeSlot({ id: 'cold-slot-1', zone_id: 'zone-cold', row: 1, level: 1, position: 1 });
    mockedRackSlotFindMany.mockResolvedValueOnce([coldSlot]);
    mockedRackSlotFindMany.mockResolvedValueOnce([]);

    const result = await recommendSlots('lot-temp');

    expect(mockedZoneFindMany).toHaveBeenCalledWith({
      where: { zone_type: { in: ['cold_chain'] } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cold-slot-1');
  });
});
