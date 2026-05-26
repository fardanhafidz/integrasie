import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client
vi.mock('@server/config/database', () => ({
  prisma: {
    supplierIntake: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    lot: {
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock the lotGenerator module
vi.mock('@server/modules/intake/lotGenerator', () => ({
  generateLotNumber: vi.fn(),
}));

import { prisma } from '@server/config/database';
import { generateLotNumber } from '@server/modules/intake/lotGenerator';
import {
  createIntake,
  getIntakes,
  getIntakeById,
  checkDuplicate,
  ValidationError,
  DuplicateWarningError,
  DatabaseError,
} from '@server/modules/intake/intake.service';

const mockedPrisma = vi.mocked(prisma, true);
const mockedGenerateLotNumber = vi.mocked(generateLotNumber);

describe('IntakeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validIntakeData = {
    supplier_name: 'Acme Chemicals',
    material_group: 'Raw Chemical',
    material_group_code: 'RC',
    quantity: 100,
    unit: 'kg',
    delivery_date: '2025-01-15',
    truck_reference: 'TRK001',
  };

  const userId = 'user-uuid-123';

  describe('checkDuplicate', () => {
    it('should return true when a duplicate truck reference exists for the same date', async () => {
      mockedPrisma.supplierIntake.findFirst.mockResolvedValue({
        id: 'existing-id',
      } as any);

      const result = await checkDuplicate('TRK001', '2025-01-15');

      expect(result).toBe(true);
      expect(mockedPrisma.supplierIntake.findFirst).toHaveBeenCalledWith({
        where: {
          truck_reference: 'TRK001',
          delivery_date: {
            gte: new Date('2025-01-15T00:00:00Z'),
            lt: new Date('2025-01-16T00:00:00Z'),
          },
        },
      });
    });

    it('should return false when no duplicate exists', async () => {
      mockedPrisma.supplierIntake.findFirst.mockResolvedValue(null);

      const result = await checkDuplicate('TRK002', '2025-01-15');

      expect(result).toBe(false);
    });
  });

  describe('createIntake', () => {
    it('should throw ValidationError for invalid input (missing required fields)', async () => {
      const invalidData = { supplier_name: '' } as any;

      await expect(createIntake(invalidData, userId)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError with field-level details', async () => {
      const invalidData = {
        supplier_name: '',
        material_group: 'Invalid Group',
        material_group_code: 'rc', // lowercase
        quantity: -5,
        unit: '',
        delivery_date: 'not-a-date',
        truck_reference: '',
      };

      try {
        await createIntake(invalidData, userId);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.statusCode).toBe(400);
        expect(validationError.fieldErrors).toBeDefined();
        expect(Object.keys(validationError.fieldErrors).length).toBeGreaterThan(0);
      }
    });

    it('should throw DuplicateWarningError when duplicate truck ref exists on same day', async () => {
      mockedPrisma.supplierIntake.findFirst.mockResolvedValue({
        id: 'existing-id',
      } as any);

      await expect(createIntake(validIntakeData, userId)).rejects.toThrow(
        DuplicateWarningError
      );
    });

    it('should skip duplicate check when confirmDuplicate is true', async () => {
      const mockIntake = {
        id: 'intake-uuid',
        supplier_name: 'Acme Chemicals',
        material_group: 'Raw Chemical',
        material_group_code: 'RC',
        quantity: 100,
        unit: 'kg',
        delivery_date: new Date('2025-01-15T00:00:00Z'),
        truck_reference: 'TRK001',
        is_locked: true,
        created_by: userId,
        created_at: new Date(),
      };
      const mockLot = {
        id: 'lot-uuid',
        lot_number: 'RC-20250115-0001',
        supplier_intake_id: 'intake-uuid',
        status: 'pending_qc',
        material_group_code: 'RC',
        is_temperature_sensitive: false,
        is_hazardous: false,
        hazard_class: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockedGenerateLotNumber.mockResolvedValue('RC-20250115-0001');

      mockedPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          supplierIntake: { create: vi.fn().mockResolvedValue(mockIntake) },
          lot: { create: vi.fn().mockResolvedValue(mockLot) },
        };
        return fn(tx);
      });

      const result = await createIntake(validIntakeData, userId, true);

      expect(result.intake).toEqual(mockIntake);
      expect(result.lot).toEqual(mockLot);
      // Should NOT have called findFirst for duplicate check
      expect(mockedPrisma.supplierIntake.findFirst).not.toHaveBeenCalled();
    });

    it('should create intake with is_locked = true and lot with pending_qc status', async () => {
      mockedPrisma.supplierIntake.findFirst.mockResolvedValue(null);
      mockedGenerateLotNumber.mockResolvedValue('RC-20250115-0001');

      const mockIntake = {
        id: 'intake-uuid',
        supplier_name: 'Acme Chemicals',
        material_group: 'Raw Chemical',
        material_group_code: 'RC',
        quantity: 100,
        unit: 'kg',
        delivery_date: new Date('2025-01-15T00:00:00Z'),
        truck_reference: 'TRK001',
        is_locked: true,
        created_by: userId,
        created_at: new Date(),
      };
      const mockLot = {
        id: 'lot-uuid',
        lot_number: 'RC-20250115-0001',
        supplier_intake_id: 'intake-uuid',
        status: 'pending_qc',
        material_group_code: 'RC',
        is_temperature_sensitive: false,
        is_hazardous: false,
        hazard_class: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const txCreate = vi.fn().mockResolvedValue(mockIntake);
      const txLotCreate = vi.fn().mockResolvedValue(mockLot);

      mockedPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          supplierIntake: { create: txCreate },
          lot: { create: txLotCreate },
        };
        return fn(tx);
      });

      const result = await createIntake(validIntakeData, userId);

      expect(result.intake.is_locked).toBe(true);
      expect(result.lot.status).toBe('pending_qc');

      // Verify intake was created with is_locked = true
      expect(txCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          is_locked: true,
          created_by: userId,
          supplier_name: 'Acme Chemicals',
        }),
      });

      // Verify lot was created with pending_qc status
      expect(txLotCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'pending_qc',
          material_group_code: 'RC',
          lot_number: 'RC-20250115-0001',
        }),
      });
    });

    it('should throw DatabaseError when transaction fails', async () => {
      mockedPrisma.supplierIntake.findFirst.mockResolvedValue(null);
      mockedGenerateLotNumber.mockResolvedValue('RC-20250115-0001');
      mockedPrisma.$transaction.mockRejectedValue(new Error('DB connection lost'));

      await expect(createIntake(validIntakeData, userId)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getIntakes', () => {
    it('should return paginated intakes with default pagination', async () => {
      const mockIntakes = [
        { id: '1', supplier_name: 'Supplier A', lots: [] },
        { id: '2', supplier_name: 'Supplier B', lots: [] },
      ];

      mockedPrisma.supplierIntake.findMany.mockResolvedValue(mockIntakes as any);
      mockedPrisma.supplierIntake.count.mockResolvedValue(2);

      const result = await getIntakes();

      expect(result.data).toEqual(mockIntakes);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
      expect(mockedPrisma.supplierIntake.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        orderBy: { created_at: 'desc' },
        include: {
          lots: {
            select: {
              id: true,
              lot_number: true,
              status: true,
            },
          },
        },
      });
    });

    it('should respect page and limit parameters', async () => {
      mockedPrisma.supplierIntake.findMany.mockResolvedValue([]);
      mockedPrisma.supplierIntake.count.mockResolvedValue(100);

      const result = await getIntakes(3, 10);

      expect(result.pagination.page).toBe(3);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.totalPages).toBe(10);
      expect(mockedPrisma.supplierIntake.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    it('should clamp limit to max 50', async () => {
      mockedPrisma.supplierIntake.findMany.mockResolvedValue([]);
      mockedPrisma.supplierIntake.count.mockResolvedValue(0);

      const result = await getIntakes(1, 100);

      expect(result.pagination.limit).toBe(50);
      expect(mockedPrisma.supplierIntake.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      );
    });

    it('should clamp page to minimum 1', async () => {
      mockedPrisma.supplierIntake.findMany.mockResolvedValue([]);
      mockedPrisma.supplierIntake.count.mockResolvedValue(0);

      const result = await getIntakes(0, 20);

      expect(result.pagination.page).toBe(1);
      expect(mockedPrisma.supplierIntake.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 })
      );
    });
  });

  describe('getIntakeById', () => {
    it('should return intake with associated lot and creator', async () => {
      const mockIntake = {
        id: 'intake-uuid',
        supplier_name: 'Acme Chemicals',
        lots: [{ id: 'lot-uuid', lot_number: 'RC-20250115-0001', status: 'pending_qc' }],
        creator: { id: userId, full_name: 'John Doe', email: 'john@example.com' },
      };

      mockedPrisma.supplierIntake.findUnique.mockResolvedValue(mockIntake as any);

      const result = await getIntakeById('intake-uuid');

      expect(result).toEqual(mockIntake);
      expect(mockedPrisma.supplierIntake.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'intake-uuid' },
        })
      );
    });

    it('should return null when intake not found', async () => {
      mockedPrisma.supplierIntake.findUnique.mockResolvedValue(null);

      const result = await getIntakeById('non-existent-id');

      expect(result).toBeNull();
    });
  });
});
