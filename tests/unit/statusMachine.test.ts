import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LotStatus } from '@shared/types';

// Mock the prisma client
vi.mock('@server/config/database', () => ({
  prisma: {
    lot: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock the notification service
vi.mock('@server/modules/notification/notification.service', () => ({
  emitLotReadyToStore: vi.fn(),
}));

import {
  VALID_TRANSITIONS,
  isValidTransition,
  getValidNextStatuses,
  transitionLotStatus,
} from '@server/modules/qc/statusMachine';
import { prisma } from '@server/config/database';
import { emitLotReadyToStore } from '@server/modules/notification/notification.service';

describe('statusMachine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VALID_TRANSITIONS', () => {
    it('should define pending_qc can transition to passed and rejected', () => {
      expect(VALID_TRANSITIONS[LotStatus.PENDING_QC]).toEqual([
        LotStatus.PASSED,
        LotStatus.REJECTED,
      ]);
    });

    it('should define passed can transition to ready_to_store', () => {
      expect(VALID_TRANSITIONS[LotStatus.PASSED]).toEqual([
        LotStatus.READY_TO_STORE,
      ]);
    });

    it('should define rejected as a terminal state', () => {
      expect(VALID_TRANSITIONS[LotStatus.REJECTED]).toEqual([]);
    });

    it('should define ready_to_store as a terminal state', () => {
      expect(VALID_TRANSITIONS[LotStatus.READY_TO_STORE]).toEqual([]);
    });
  });

  describe('isValidTransition', () => {
    it('should return true for pending_qc → passed', () => {
      expect(isValidTransition(LotStatus.PENDING_QC, LotStatus.PASSED)).toBe(true);
    });

    it('should return true for pending_qc → rejected', () => {
      expect(isValidTransition(LotStatus.PENDING_QC, LotStatus.REJECTED)).toBe(true);
    });

    it('should return true for passed → ready_to_store', () => {
      expect(isValidTransition(LotStatus.PASSED, LotStatus.READY_TO_STORE)).toBe(true);
    });

    it('should return false for pending_qc → ready_to_store (skip not allowed)', () => {
      expect(isValidTransition(LotStatus.PENDING_QC, LotStatus.READY_TO_STORE)).toBe(false);
    });

    it('should return false for rejected → passed (terminal state)', () => {
      expect(isValidTransition(LotStatus.REJECTED, LotStatus.PASSED)).toBe(false);
    });

    it('should return false for ready_to_store → pending_qc (no backward)', () => {
      expect(isValidTransition(LotStatus.READY_TO_STORE, LotStatus.PENDING_QC)).toBe(false);
    });

    it('should return false for passed → pending_qc (no backward)', () => {
      expect(isValidTransition(LotStatus.PASSED, LotStatus.PENDING_QC)).toBe(false);
    });

    it('should return false for same-status transition', () => {
      expect(isValidTransition(LotStatus.PENDING_QC, LotStatus.PENDING_QC)).toBe(false);
    });
  });

  describe('getValidNextStatuses', () => {
    it('should return [passed, rejected] for pending_qc', () => {
      expect(getValidNextStatuses(LotStatus.PENDING_QC)).toEqual([
        LotStatus.PASSED,
        LotStatus.REJECTED,
      ]);
    });

    it('should return [ready_to_store] for passed', () => {
      expect(getValidNextStatuses(LotStatus.PASSED)).toEqual([
        LotStatus.READY_TO_STORE,
      ]);
    });

    it('should return empty array for rejected', () => {
      expect(getValidNextStatuses(LotStatus.REJECTED)).toEqual([]);
    });

    it('should return empty array for ready_to_store', () => {
      expect(getValidNextStatuses(LotStatus.READY_TO_STORE)).toEqual([]);
    });
  });

  describe('transitionLotStatus', () => {
    const mockLot = {
      id: 'lot-123',
      lot_number: 'RM-20240101-0001',
      status: LotStatus.PENDING_QC,
      material_group_code: 'RM',
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should update lot status for a valid transition', async () => {
      const updatedLot = { ...mockLot, status: LotStatus.PASSED, supplier_intake: { material_group: 'Raw Materials' } };
      vi.mocked(prisma.lot.findUnique).mockResolvedValue(mockLot as any);
      vi.mocked(prisma.lot.update).mockResolvedValue(updatedLot as any);

      const result = await transitionLotStatus(
        'lot-123',
        LotStatus.PASSED,
        'user-456'
      );

      expect(prisma.lot.findUnique).toHaveBeenCalledWith({
        where: { id: 'lot-123' },
      });
      expect(prisma.lot.update).toHaveBeenCalledWith({
        where: { id: 'lot-123' },
        data: {
          status: LotStatus.PASSED,
          updated_at: expect.any(Date),
        },
        include: {
          supplier_intake: {
            select: {
              material_group: true,
            },
          },
        },
      });
      expect(result.status).toBe(LotStatus.PASSED);
      // Should NOT emit notification for non-ready_to_store transitions
      expect(emitLotReadyToStore).not.toHaveBeenCalled();
    });

    it('should throw error when lot is not found', async () => {
      vi.mocked(prisma.lot.findUnique).mockResolvedValue(null);

      await expect(
        transitionLotStatus('nonexistent', LotStatus.PASSED, 'user-456')
      ).rejects.toThrow("Lot with id 'nonexistent' not found");
    });

    it('should throw error with correct message for invalid transition', async () => {
      vi.mocked(prisma.lot.findUnique).mockResolvedValue(mockLot as any);

      try {
        await transitionLotStatus('lot-123', LotStatus.READY_TO_STORE, 'user-456');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.error).toBe('Invalid status transition');
        expect(err.message).toBe(
          'Cannot transition from pending_qc to ready_to_store. Valid transitions: passed, rejected'
        );
      }
    });

    it('should throw error for transition from terminal state', async () => {
      const rejectedLot = { ...mockLot, status: LotStatus.REJECTED };
      vi.mocked(prisma.lot.findUnique).mockResolvedValue(rejectedLot as any);

      try {
        await transitionLotStatus('lot-123', LotStatus.PASSED, 'user-456');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.error).toBe('Invalid status transition');
        expect(err.message).toBe(
          'Cannot transition from rejected to passed. Valid transitions: none'
        );
      }
    });

    it('should successfully transition passed → ready_to_store', async () => {
      const passedLot = { ...mockLot, status: LotStatus.PASSED };
      const updatedLot = { ...passedLot, status: LotStatus.READY_TO_STORE, supplier_intake: { material_group: 'Raw Materials' } };
      vi.mocked(prisma.lot.findUnique).mockResolvedValue(passedLot as any);
      vi.mocked(prisma.lot.update).mockResolvedValue(updatedLot as any);

      const result = await transitionLotStatus(
        'lot-123',
        LotStatus.READY_TO_STORE,
        'user-456'
      );

      expect(result.status).toBe(LotStatus.READY_TO_STORE);
      // Should emit notification when transitioning to ready_to_store
      expect(emitLotReadyToStore).toHaveBeenCalledWith(
        'lot-123',
        'RM-20240101-0001',
        'Raw Materials'
      );
    });

    it('should emit notification with empty material group when supplier_intake is null', async () => {
      const passedLot = { ...mockLot, status: LotStatus.PASSED };
      const updatedLot = { ...passedLot, status: LotStatus.READY_TO_STORE, supplier_intake: null };
      vi.mocked(prisma.lot.findUnique).mockResolvedValue(passedLot as any);
      vi.mocked(prisma.lot.update).mockResolvedValue(updatedLot as any);

      const result = await transitionLotStatus(
        'lot-123',
        LotStatus.READY_TO_STORE,
        'user-456'
      );

      expect(result.status).toBe(LotStatus.READY_TO_STORE);
      expect(emitLotReadyToStore).toHaveBeenCalledWith(
        'lot-123',
        'RM-20240101-0001',
        ''
      );
    });
  });
});
