import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Socket.IO before importing the module under test
vi.mock('@server/index', () => ({
  io: {
    emit: vi.fn(),
  },
}));

// Mock Prisma before importing the module under test
vi.mock('@server/config/database', () => ({
  prisma: {
    lot: {
      findUnique: vi.fn(),
    },
    rackSlot: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditTrail: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { overrideSlot } from '@server/modules/slotting/slotting.service';
import { prisma } from '@server/config/database';
import { io } from '@server/index';

const mockedLotFindUnique = vi.mocked(prisma.lot.findUnique);
const mockedRackSlotFindUnique = vi.mocked(prisma.rackSlot.findUnique);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedIoEmit = vi.mocked(io.emit);

function makeLot(overrides = {}) {
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
  };
}

function makeSlot(overrides = {}) {
  return {
    id: 'slot-1',
    zone_id: 'zone-1',
    coordinate: 'A-1-1-1',
    row: 1,
    level: 1,
    position: 1,
    status: 'available',
    current_lot_id: null,
    zone: {
      id: 'zone-1',
      name: 'Standard Zone A',
      zone_type: 'standard',
      temperature_min: null,
      temperature_max: null,
      block_identifier: 'ST-A',
    },
    ...overrides,
  };
}

describe('SlottingService - overrideSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Justification validation', () => {
    it('should throw error when justification is empty', async () => {
      await expect(overrideSlot('lot-1', 'slot-1', '', 'user-1')).rejects.toThrow(
        'Justification must be at least 10 characters'
      );
    });

    it('should throw error when justification is less than 10 characters', async () => {
      await expect(overrideSlot('lot-1', 'slot-1', 'too short', 'user-1')).rejects.toThrow(
        'Justification must be at least 10 characters'
      );
    });

    it('should throw error when justification is only whitespace', async () => {
      await expect(overrideSlot('lot-1', 'slot-1', '          ', 'user-1')).rejects.toThrow(
        'Justification must be at least 10 characters'
      );
    });

    it('should throw error when justification trimmed is less than 10 characters', async () => {
      await expect(overrideSlot('lot-1', 'slot-1', '   short   ', 'user-1')).rejects.toThrow(
        'Justification must be at least 10 characters'
      );
    });
  });

  describe('Lot validation', () => {
    it('should throw error when lot is not found', async () => {
      mockedLotFindUnique.mockResolvedValue(null);

      await expect(
        overrideSlot('non-existent-lot', 'slot-1', 'This is a valid justification', 'user-1')
      ).rejects.toThrow('Lot not found: non-existent-lot');
    });

    it('should throw error when lot is not in ready_to_store status', async () => {
      mockedLotFindUnique.mockResolvedValue(makeLot({ status: 'pending_qc' }) as any);

      await expect(
        overrideSlot('lot-1', 'slot-1', 'This is a valid justification', 'user-1')
      ).rejects.toThrow('Lot is not ready to store. Current status: pending_qc');
    });
  });

  describe('Slot validation', () => {
    it('should throw error when slot is not found', async () => {
      mockedLotFindUnique.mockResolvedValue(makeLot() as any);
      mockedRackSlotFindUnique.mockResolvedValue(null);

      await expect(
        overrideSlot('lot-1', 'non-existent-slot', 'This is a valid justification', 'user-1')
      ).rejects.toThrow('Slot not found: non-existent-slot');
    });

    it('should throw error when slot is occupied', async () => {
      mockedLotFindUnique.mockResolvedValue(makeLot() as any);
      mockedRackSlotFindUnique.mockResolvedValue(
        makeSlot({ status: 'occupied', current_lot_id: 'other-lot' }) as any
      );

      await expect(
        overrideSlot('lot-1', 'slot-1', 'This is a valid justification', 'user-1')
      ).rejects.toThrow('Slot is not available. Current status: occupied');
    });

    it('should throw error when slot is reserved', async () => {
      mockedLotFindUnique.mockResolvedValue(makeLot() as any);
      mockedRackSlotFindUnique.mockResolvedValue(makeSlot({ status: 'reserved' }) as any);

      await expect(
        overrideSlot('lot-1', 'slot-1', 'This is a valid justification', 'user-1')
      ).rejects.toThrow('Slot is not available. Current status: reserved');
    });
  });

  describe('Successful override', () => {
    it('should execute transaction to update slot and create audit trail with justification', async () => {
      const lot = makeLot();
      const slot = makeSlot();
      const updatedSlot = { ...slot, status: 'occupied', current_lot_id: 'lot-1' };

      mockedLotFindUnique.mockResolvedValue(lot as any);
      mockedRackSlotFindUnique.mockResolvedValue(slot as any);

      mockedTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          rackSlot: {
            update: vi.fn().mockResolvedValue(updatedSlot),
          },
          auditTrail: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        };
        return callback(tx);
      });

      const result = await overrideSlot(
        'lot-1',
        'slot-1',
        'This is a valid justification for override',
        'user-1'
      );

      expect(result).toEqual(updatedSlot);
      expect(mockedTransaction).toHaveBeenCalledOnce();
    });

    it('should update slot status to occupied and set current_lot_id in transaction', async () => {
      const lot = makeLot();
      const slot = makeSlot();
      const updatedSlot = { ...slot, status: 'occupied', current_lot_id: 'lot-1' };

      mockedLotFindUnique.mockResolvedValue(lot as any);
      mockedRackSlotFindUnique.mockResolvedValue(slot as any);

      let capturedUpdateArgs: any = null;
      mockedTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          rackSlot: {
            update: vi.fn().mockImplementation((args: any) => {
              capturedUpdateArgs = args;
              return Promise.resolve(updatedSlot);
            }),
          },
          auditTrail: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        };
        return callback(tx);
      });

      await overrideSlot(
        'lot-1',
        'slot-1',
        'This is a valid justification for override',
        'user-1'
      );

      expect(capturedUpdateArgs).toEqual({
        where: { id: 'slot-1' },
        data: {
          status: 'occupied',
          current_lot_id: 'lot-1',
        },
      });
    });

    it('should create audit trail record with override justification', async () => {
      const lot = makeLot({ id: 'lot-1', lot_number: 'RM-20240101-0001' });
      const slot = makeSlot({ id: 'slot-1', coordinate: 'A-1-1-1' });
      const updatedSlot = { ...slot, status: 'occupied', current_lot_id: 'lot-1' };

      mockedLotFindUnique.mockResolvedValue(lot as any);
      mockedRackSlotFindUnique.mockResolvedValue(slot as any);

      let capturedAuditArgs: any = null;
      mockedTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          rackSlot: {
            update: vi.fn().mockResolvedValue(updatedSlot),
          },
          auditTrail: {
            create: vi.fn().mockImplementation((args: any) => {
              capturedAuditArgs = args;
              return Promise.resolve({ id: 'audit-1' });
            }),
          },
        };
        return callback(tx);
      });

      await overrideSlot(
        'lot-1',
        'slot-1',
        'This is a valid justification for override',
        'user-1'
      );

      expect(capturedAuditArgs).toEqual({
        data: {
          user_id: 'user-1',
          action: 'slot_override',
          entity_type: 'rack_slot',
          entity_id: 'slot-1',
          old_value: {
            status: 'available',
            current_lot_id: null,
            coordinate: 'A-1-1-1',
          },
          new_value: {
            status: 'occupied',
            current_lot_id: 'lot-1',
            lot_number: 'RM-20240101-0001',
            coordinate: 'A-1-1-1',
            override_justification: 'This is a valid justification for override',
          },
        },
      });
    });

    it('should emit Socket.IO event slot:override after successful override', async () => {
      const lot = makeLot();
      const slot = makeSlot();
      const updatedSlot = { ...slot, status: 'occupied', current_lot_id: 'lot-1' };

      mockedLotFindUnique.mockResolvedValue(lot as any);
      mockedRackSlotFindUnique.mockResolvedValue(slot as any);

      mockedTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          rackSlot: {
            update: vi.fn().mockResolvedValue(updatedSlot),
          },
          auditTrail: {
            create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        };
        return callback(tx);
      });

      await overrideSlot(
        'lot-1',
        'slot-1',
        'This is a valid justification for override',
        'user-1'
      );

      expect(mockedIoEmit).toHaveBeenCalledOnce();
      expect(mockedIoEmit).toHaveBeenCalledWith('slot:override', {
        lotId: 'lot-1',
        slotId: 'slot-1',
        justification: 'This is a valid justification for override',
        userId: 'user-1',
        timestamp: expect.any(String),
      });
    });

    it('should trim justification before storing and emitting', async () => {
      const lot = makeLot({ id: 'lot-1', lot_number: 'RM-20240101-0001' });
      const slot = makeSlot({ id: 'slot-1', coordinate: 'A-1-1-1' });
      const updatedSlot = { ...slot, status: 'occupied', current_lot_id: 'lot-1' };

      mockedLotFindUnique.mockResolvedValue(lot as any);
      mockedRackSlotFindUnique.mockResolvedValue(slot as any);

      let capturedAuditArgs: any = null;
      mockedTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          rackSlot: {
            update: vi.fn().mockResolvedValue(updatedSlot),
          },
          auditTrail: {
            create: vi.fn().mockImplementation((args: any) => {
              capturedAuditArgs = args;
              return Promise.resolve({ id: 'audit-1' });
            }),
          },
        };
        return callback(tx);
      });

      await overrideSlot(
        'lot-1',
        'slot-1',
        '   Valid justification with spaces   ',
        'user-1'
      );

      // Audit trail should have trimmed justification
      expect(capturedAuditArgs.data.new_value.override_justification).toBe(
        'Valid justification with spaces'
      );

      // Socket.IO event should have trimmed justification
      expect(mockedIoEmit).toHaveBeenCalledWith('slot:override', {
        lotId: 'lot-1',
        slotId: 'slot-1',
        justification: 'Valid justification with spaces',
        userId: 'user-1',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Error propagation', () => {
    it('should propagate transaction errors', async () => {
      const lot = makeLot();
      const slot = makeSlot();

      mockedLotFindUnique.mockResolvedValue(lot as any);
      mockedRackSlotFindUnique.mockResolvedValue(slot as any);

      mockedTransaction.mockRejectedValue(new Error('Database transaction failed'));

      await expect(
        overrideSlot('lot-1', 'slot-1', 'This is a valid justification', 'user-1')
      ).rejects.toThrow('Database transaction failed');
    });

    it('should not emit Socket.IO event if transaction fails', async () => {
      const lot = makeLot();
      const slot = makeSlot();

      mockedLotFindUnique.mockResolvedValue(lot as any);
      mockedRackSlotFindUnique.mockResolvedValue(slot as any);

      mockedTransaction.mockRejectedValue(new Error('Database transaction failed'));

      await expect(
        overrideSlot('lot-1', 'slot-1', 'This is a valid justification', 'user-1')
      ).rejects.toThrow();

      expect(mockedIoEmit).not.toHaveBeenCalled();
    });
  });
});
