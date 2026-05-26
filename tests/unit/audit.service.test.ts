import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  recordAudit,
  ensureRecorded,
  queryAuditTrail,
  type AuditParams,
} from '@server/modules/audit/audit.service';

// Mock Prisma
vi.mock('@server/config/database', () => {
  const mockAuditTrail = {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };

  return {
    prisma: {
      auditTrail: mockAuditTrail,
      $transaction: vi.fn(),
    },
  };
});

import { prisma } from '@server/config/database';

const mockAuditRecord = {
  id: 'audit-001',
  user_id: 'user-123',
  action: 'lot_status_change',
  entity_type: 'lot',
  entity_id: 'lot-456',
  old_value: { status: 'pending_qc' },
  new_value: { status: 'passed' },
  timestamp: new Date('2024-01-15T10:30:00.000Z'),
};

describe('Audit Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordAudit', () => {
    it('should create an audit record with all required fields', async () => {
      vi.mocked(prisma.auditTrail.create).mockResolvedValue(mockAuditRecord as any);

      const params: AuditParams = {
        userId: 'user-123',
        action: 'lot_status_change',
        entityType: 'lot',
        entityId: 'lot-456',
        oldValue: { status: 'pending_qc' },
        newValue: { status: 'passed' },
      };

      const result = await recordAudit(params);

      expect(prisma.auditTrail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 'user-123',
          action: 'lot_status_change',
          entity_type: 'lot',
          entity_id: 'lot-456',
          old_value: { status: 'pending_qc' },
          new_value: { status: 'passed' },
          timestamp: expect.any(Date),
        }),
      });
      expect(result).toEqual(mockAuditRecord);
    });

    it('should handle null old_value for initial creation events', async () => {
      const recordWithNullOld = {
        ...mockAuditRecord,
        old_value: null,
      };
      vi.mocked(prisma.auditTrail.create).mockResolvedValue(recordWithNullOld as any);

      const params: AuditParams = {
        userId: 'user-123',
        action: 'drum_placement',
        entityType: 'drum',
        entityId: 'drum-789',
        oldValue: null,
        newValue: { rack_coordinate: 'A-01-02-03' },
      };

      const result = await recordAudit(params);

      expect(prisma.auditTrail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          old_value: Prisma.JsonNull,
          new_value: { rack_coordinate: 'A-01-02-03' },
        }),
      });
      expect(result.old_value).toBeNull();
    });

    it('should set timestamp to current UTC time', async () => {
      const now = new Date();
      (prisma.auditTrail.create as any).mockImplementation(async (args: any) => ({
        ...mockAuditRecord,
        timestamp: args.data.timestamp,
      }));

      const params: AuditParams = {
        userId: 'user-123',
        action: 'lot_status_change',
        entityType: 'lot',
        entityId: 'lot-456',
        oldValue: null,
        newValue: { status: 'pending_qc' },
      };

      const result = await recordAudit(params);

      // Timestamp should be close to now (within 1 second)
      const timeDiff = Math.abs(result.timestamp.getTime() - now.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('should propagate database errors', async () => {
      vi.mocked(prisma.auditTrail.create).mockRejectedValue(
        new Error('Database connection failed')
      );

      const params: AuditParams = {
        userId: 'user-123',
        action: 'lot_status_change',
        entityType: 'lot',
        entityId: 'lot-456',
        oldValue: null,
        newValue: { status: 'passed' },
      };

      await expect(recordAudit(params)).rejects.toThrow('Database connection failed');
    });

    it('should record drum location changes with old and new coordinates', async () => {
      const locationChangeRecord = {
        ...mockAuditRecord,
        action: 'drum_location_change',
        entity_type: 'drum',
        entity_id: 'drum-001',
        old_value: { rack_coordinate: 'A-01-01-01' },
        new_value: { rack_coordinate: 'B-02-03-04' },
      };
      vi.mocked(prisma.auditTrail.create).mockResolvedValue(locationChangeRecord as any);

      const params: AuditParams = {
        userId: 'user-123',
        action: 'drum_location_change',
        entityType: 'drum',
        entityId: 'drum-001',
        oldValue: { rack_coordinate: 'A-01-01-01' },
        newValue: { rack_coordinate: 'B-02-03-04' },
      };

      const result = await recordAudit(params);

      expect(result.action).toBe('drum_location_change');
      expect(result.old_value).toEqual({ rack_coordinate: 'A-01-01-01' });
      expect(result.new_value).toEqual({ rack_coordinate: 'B-02-03-04' });
    });
  });

  describe('ensureRecorded', () => {
    it('should execute operation and create audit record in a transaction', async () => {
      const mockTx = {
        auditTrail: {
          create: vi.fn().mockResolvedValue(mockAuditRecord),
        },
        lot: {
          update: vi.fn().mockResolvedValue({ id: 'lot-456', status: 'passed' }),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn(mockTx);
      });

      const auditParams: AuditParams = {
        userId: 'user-123',
        action: 'lot_status_change',
        entityType: 'lot',
        entityId: 'lot-456',
        oldValue: { status: 'pending_qc' },
        newValue: { status: 'passed' },
      };

      const result = await ensureRecorded(
        async (tx: any) => tx.lot.update({ where: { id: 'lot-456' }, data: { status: 'passed' } }),
        auditParams
      );

      expect(result).toEqual({ id: 'lot-456', status: 'passed' });
      expect(mockTx.lot.update).toHaveBeenCalled();
      expect(mockTx.auditTrail.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 'user-123',
          action: 'lot_status_change',
          entity_type: 'lot',
          entity_id: 'lot-456',
          old_value: { status: 'pending_qc' },
          new_value: { status: 'passed' },
          timestamp: expect.any(Date),
        }),
      });
    });

    it('should rollback entire transaction if audit record creation fails', async () => {
      const mockTx = {
        auditTrail: {
          create: vi.fn().mockRejectedValue(new Error('Audit insert failed')),
        },
        lot: {
          update: vi.fn().mockResolvedValue({ id: 'lot-456', status: 'passed' }),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn(mockTx);
      });

      const auditParams: AuditParams = {
        userId: 'user-123',
        action: 'lot_status_change',
        entityType: 'lot',
        entityId: 'lot-456',
        oldValue: { status: 'pending_qc' },
        newValue: { status: 'passed' },
      };

      await expect(
        ensureRecorded(
          async (tx: any) => tx.lot.update({ where: { id: 'lot-456' }, data: { status: 'passed' } }),
          auditParams
        )
      ).rejects.toThrow('Audit insert failed');
    });

    it('should rollback if the operation itself fails', async () => {
      const mockTx = {
        auditTrail: {
          create: vi.fn(),
        },
        lot: {
          update: vi.fn().mockRejectedValue(new Error('Operation failed')),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn(mockTx);
      });

      const auditParams: AuditParams = {
        userId: 'user-123',
        action: 'lot_status_change',
        entityType: 'lot',
        entityId: 'lot-456',
        oldValue: { status: 'pending_qc' },
        newValue: { status: 'passed' },
      };

      await expect(
        ensureRecorded(
          async (tx: any) => tx.lot.update({ where: { id: 'lot-456' }, data: { status: 'passed' } }),
          auditParams
        )
      ).rejects.toThrow('Operation failed');

      // Audit record should NOT have been created since operation failed first
      expect(mockTx.auditTrail.create).not.toHaveBeenCalled();
    });

    it('should return the operation result on success', async () => {
      const expectedResult = { id: 'lot-456', status: 'ready_to_store', lot_number: 'RM-20240115-0001' };
      const mockTx = {
        auditTrail: {
          create: vi.fn().mockResolvedValue(mockAuditRecord),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        return fn(mockTx);
      });

      const auditParams: AuditParams = {
        userId: 'user-123',
        action: 'lot_status_change',
        entityType: 'lot',
        entityId: 'lot-456',
        oldValue: { status: 'passed' },
        newValue: { status: 'ready_to_store' },
      };

      const result = await ensureRecorded(
        async () => expectedResult,
        auditParams
      );

      expect(result).toEqual(expectedResult);
    });
  });

  describe('queryAuditTrail', () => {
    const mockRecords = [
      { ...mockAuditRecord, id: 'audit-003', timestamp: new Date('2024-01-15T12:00:00Z') },
      { ...mockAuditRecord, id: 'audit-002', timestamp: new Date('2024-01-15T11:00:00Z') },
      { ...mockAuditRecord, id: 'audit-001', timestamp: new Date('2024-01-15T10:00:00Z') },
    ];

    it('should return paginated results in reverse chronological order', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue(mockRecords as any);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(3);

      const result = await queryAuditTrail({});

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { timestamp: 'desc' },
          skip: 0,
          take: 50,
        })
      );
      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should enforce maximum 50 records per page', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      await queryAuditTrail({ limit: 100 });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should handle page parameter correctly', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(100);

      const result = await queryAuditTrail({ page: 2, limit: 25 });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 25,
        })
      );
      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
      expect(result.totalPages).toBe(4);
    });

    it('should filter by date range', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      await queryAuditTrail({
        dateFrom: '2024-01-01T00:00:00Z',
        dateTo: '2024-01-31T23:59:59Z',
      });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: {
              gte: new Date('2024-01-01T00:00:00Z'),
              lte: new Date('2024-01-31T23:59:59Z'),
            },
          }),
        })
      );
    });

    it('should filter by userId', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      await queryAuditTrail({ userId: 'user-123' });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: 'user-123',
          }),
        })
      );
    });

    it('should filter by action type', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      await queryAuditTrail({ action: 'lot_status_change' });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'lot_status_change',
          }),
        })
      );
    });

    it('should filter by lot number (searches entity_id and JSON values)', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      await queryAuditTrail({ lotNumber: 'RM-20240115-0001' });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { entity_id: 'RM-20240115-0001' },
              { new_value: { path: ['lot_number'], equals: 'RM-20240115-0001' } },
              { old_value: { path: ['lot_number'], equals: 'RM-20240115-0001' } },
            ],
          }),
        })
      );
    });

    it('should default to page 1 when page is not provided', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      const result = await queryAuditTrail({});

      expect(result.page).toBe(1);
      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 })
      );
    });

    it('should handle page less than 1 by defaulting to 1', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      const result = await queryAuditTrail({ page: 0 });

      expect(result.page).toBe(1);
    });

    it('should handle limit less than 1 by defaulting to 1', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      await queryAuditTrail({ limit: 0 });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 })
      );
    });

    it('should calculate totalPages correctly', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(123);

      const result = await queryAuditTrail({ limit: 50 });

      expect(result.totalPages).toBe(3); // ceil(123/50) = 3
    });

    it('should combine multiple filters', async () => {
      vi.mocked(prisma.auditTrail.findMany).mockResolvedValue([]);
      vi.mocked(prisma.auditTrail.count).mockResolvedValue(0);

      await queryAuditTrail({
        dateFrom: '2024-01-01T00:00:00Z',
        userId: 'user-123',
        action: 'lot_status_change',
      });

      expect(prisma.auditTrail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: { gte: new Date('2024-01-01T00:00:00Z') },
            user_id: 'user-123',
            action: 'lot_status_change',
          }),
        })
      );
    });
  });
});
