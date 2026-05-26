import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client
vi.mock('@server/config/database', () => ({
  prisma: {
    lot: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    qCResult: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '@server/config/database';
import {
  getPendingQCQueue,
  getLotDetails,
  submitQCResult,
  getQCHistory,
} from '@server/modules/qc/qc.service';

const mockedPrisma = vi.mocked(prisma, true);

describe('QCService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPendingQCQueue', () => {
    it('should return lots with pending_qc status ordered by delivery_date ASC', async () => {
      const mockLots = [
        {
          id: 'lot-1',
          lot_number: 'RC-20250110-0001',
          status: 'pending_qc',
          supplier_intake: {
            supplier_name: 'Supplier A',
            material_group: 'Raw Chemical',
            quantity: 100,
            delivery_date: new Date('2025-01-10'),
          },
        },
        {
          id: 'lot-2',
          lot_number: 'RC-20250112-0001',
          status: 'pending_qc',
          supplier_intake: {
            supplier_name: 'Supplier B',
            material_group: 'Solvent',
            quantity: 200,
            delivery_date: new Date('2025-01-12'),
          },
        },
      ];

      mockedPrisma.lot.findMany.mockResolvedValue(mockLots as any);

      const result = await getPendingQCQueue();

      expect(result).toEqual(mockLots);
      expect(mockedPrisma.lot.findMany).toHaveBeenCalledWith({
        where: { status: 'pending_qc' },
        orderBy: {
          supplier_intake: {
            delivery_date: 'asc',
          },
        },
        include: {
          supplier_intake: {
            select: {
              supplier_name: true,
              material_group: true,
              quantity: true,
              delivery_date: true,
            },
          },
        },
      });
    });

    it('should return empty array when no pending QC lots exist', async () => {
      mockedPrisma.lot.findMany.mockResolvedValue([]);

      const result = await getPendingQCQueue();

      expect(result).toEqual([]);
    });
  });

  describe('getLotDetails', () => {
    it('should return lot with supplier intake details', async () => {
      const mockLot = {
        id: 'lot-uuid',
        lot_number: 'RC-20250115-0001',
        status: 'pending_qc',
        supplier_intake: {
          id: 'intake-uuid',
          supplier_name: 'Acme Chemicals',
          material_group: 'Raw Chemical',
          material_group_code: 'RC',
          quantity: 100,
          unit: 'kg',
          delivery_date: new Date('2025-01-15'),
          truck_reference: 'TRK001',
        },
      };

      mockedPrisma.lot.findUnique.mockResolvedValue(mockLot as any);

      const result = await getLotDetails('lot-uuid');

      expect(result).toEqual(mockLot);
      expect(mockedPrisma.lot.findUnique).toHaveBeenCalledWith({
        where: { id: 'lot-uuid' },
        include: {
          supplier_intake: {
            select: {
              id: true,
              supplier_name: true,
              material_group: true,
              material_group_code: true,
              quantity: true,
              unit: true,
              delivery_date: true,
              truck_reference: true,
            },
          },
        },
      });
    });

    it('should throw error when lot not found', async () => {
      mockedPrisma.lot.findUnique.mockResolvedValue(null);

      await expect(getLotDetails('non-existent-id')).rejects.toThrow(
        "Lot with id 'non-existent-id' not found"
      );
    });
  });

  describe('submitQCResult', () => {
    const lotId = 'lot-uuid';
    const params = { viscosity: 5.2, ph: 7.0 };
    const testedBy = 'user-uuid';

    it('should create QC result and update lot status to passed when decision is passed', async () => {
      const mockLot = {
        id: lotId,
        lot_number: 'RC-20250115-0001',
        status: 'pending_qc',
      };

      const mockQCResult = {
        id: 'qc-result-uuid',
        lot_id: lotId,
        parameters: params,
        decision: 'passed',
        rejection_reason: null,
        tested_by: testedBy,
        tested_at: new Date(),
      };

      mockedPrisma.lot.findUnique.mockResolvedValue(mockLot as any);
      mockedPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          qCResult: { create: vi.fn().mockResolvedValue(mockQCResult) },
          lot: { update: vi.fn().mockResolvedValue({ ...mockLot, status: 'passed' }) },
          auditTrail: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await submitQCResult(lotId, params, 'passed', null, testedBy);

      expect(result).toEqual(mockQCResult);
    });

    it('should create QC result and update lot status to rejected when decision is rejected', async () => {
      const mockLot = {
        id: lotId,
        lot_number: 'RC-20250115-0001',
        status: 'pending_qc',
      };

      const rejectionReason = 'Viscosity out of acceptable range';
      const mockQCResult = {
        id: 'qc-result-uuid',
        lot_id: lotId,
        parameters: params,
        decision: 'rejected',
        rejection_reason: rejectionReason,
        tested_by: testedBy,
        tested_at: new Date(),
      };

      mockedPrisma.lot.findUnique.mockResolvedValue(mockLot as any);
      mockedPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          qCResult: { create: vi.fn().mockResolvedValue(mockQCResult) },
          lot: { update: vi.fn().mockResolvedValue({ ...mockLot, status: 'rejected' }) },
          auditTrail: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await submitQCResult(
        lotId,
        params,
        'rejected',
        rejectionReason,
        testedBy
      );

      expect(result).toEqual(mockQCResult);
      expect(result.rejection_reason).toBe(rejectionReason);
    });

    it('should throw error when lot not found', async () => {
      mockedPrisma.lot.findUnique.mockResolvedValue(null);

      await expect(
        submitQCResult('non-existent', params, 'passed', null, testedBy)
      ).rejects.toThrow("Lot with id 'non-existent' not found");
    });

    it('should throw error when lot status is not pending_qc', async () => {
      const mockLot = {
        id: lotId,
        lot_number: 'RC-20250115-0001',
        status: 'passed', // Already passed
      };

      mockedPrisma.lot.findUnique.mockResolvedValue(mockLot as any);

      await expect(
        submitQCResult(lotId, params, 'passed', null, testedBy)
      ).rejects.toThrow(
        "Lot 'lot-uuid' has status 'passed' and cannot be submitted for QC. Only lots with status 'pending_qc' can be submitted."
      );
    });

    it('should throw error when lot has rejected status', async () => {
      const mockLot = {
        id: lotId,
        lot_number: 'RC-20250115-0001',
        status: 'rejected',
      };

      mockedPrisma.lot.findUnique.mockResolvedValue(mockLot as any);

      await expect(
        submitQCResult(lotId, params, 'passed', null, testedBy)
      ).rejects.toThrow("Only lots with status 'pending_qc' can be submitted.");
    });

    it('should use a transaction to ensure atomicity of QC result creation, lot update, and audit trail', async () => {
      const mockLot = {
        id: lotId,
        lot_number: 'RC-20250115-0001',
        status: 'pending_qc',
      };

      const mockQCResult = {
        id: 'qc-result-uuid',
        lot_id: lotId,
        parameters: params,
        decision: 'passed',
        rejection_reason: null,
        tested_by: testedBy,
        tested_at: new Date(),
      };

      mockedPrisma.lot.findUnique.mockResolvedValue(mockLot as any);

      const txQCCreate = vi.fn().mockResolvedValue(mockQCResult);
      const txLotUpdate = vi.fn().mockResolvedValue({ ...mockLot, status: 'passed' });
      const txAuditCreate = vi.fn().mockResolvedValue({});

      mockedPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          qCResult: { create: txQCCreate },
          lot: { update: txLotUpdate },
          auditTrail: { create: txAuditCreate },
        };
        return fn(tx);
      });

      await submitQCResult(lotId, params, 'passed', null, testedBy);

      // Verify transaction was used
      expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);

      // Verify QC result was created with correct data
      expect(txQCCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          lot_id: lotId,
          parameters: params,
          decision: 'passed',
          rejection_reason: null,
          tested_by: testedBy,
        }),
      });

      // Verify lot status was updated
      expect(txLotUpdate).toHaveBeenCalledWith({
        where: { id: lotId },
        data: { status: 'passed' },
      });

      // Verify audit trail record was created within the transaction (Req 6.1, 6.6)
      expect(txAuditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: testedBy,
          action: 'qc_decision',
          entity_type: 'lot',
          entity_id: lotId,
          old_value: { status: 'pending_qc' },
          new_value: {
            status: 'passed',
            decision: 'passed',
            rejection_reason: null,
          },
        }),
      });
    });
  });

  describe('getQCHistory', () => {
    it('should return QC results for a lot ordered by tested_at descending', async () => {
      const mockLot = { id: 'lot-uuid', lot_number: 'RC-20250115-0001' };
      const mockResults = [
        {
          id: 'qc-2',
          lot_id: 'lot-uuid',
          parameters: { ph: 7.1 },
          decision: 'passed',
          rejection_reason: null,
          tested_by: 'user-1',
          tested_at: new Date('2025-01-16'),
          tester: { id: 'user-1', full_name: 'Jane Doe', email: 'jane@example.com' },
        },
        {
          id: 'qc-1',
          lot_id: 'lot-uuid',
          parameters: { ph: 6.0 },
          decision: 'rejected',
          rejection_reason: 'pH too low for specification',
          tested_by: 'user-2',
          tested_at: new Date('2025-01-15'),
          tester: { id: 'user-2', full_name: 'John Doe', email: 'john@example.com' },
        },
      ];

      mockedPrisma.lot.findUnique.mockResolvedValue(mockLot as any);
      mockedPrisma.qCResult.findMany.mockResolvedValue(mockResults as any);

      const result = await getQCHistory('lot-uuid');

      expect(result).toEqual(mockResults);
      expect(mockedPrisma.qCResult.findMany).toHaveBeenCalledWith({
        where: { lot_id: 'lot-uuid' },
        orderBy: { tested_at: 'desc' },
        include: {
          tester: {
            select: {
              id: true,
              full_name: true,
              email: true,
            },
          },
        },
      });
    });

    it('should throw error when lot not found', async () => {
      mockedPrisma.lot.findUnique.mockResolvedValue(null);

      await expect(getQCHistory('non-existent-id')).rejects.toThrow(
        "Lot with id 'non-existent-id' not found"
      );
    });

    it('should return empty array when lot has no QC results', async () => {
      const mockLot = { id: 'lot-uuid', lot_number: 'RC-20250115-0001' };

      mockedPrisma.lot.findUnique.mockResolvedValue(mockLot as any);
      mockedPrisma.qCResult.findMany.mockResolvedValue([]);

      const result = await getQCHistory('lot-uuid');

      expect(result).toEqual([]);
    });
  });
});
