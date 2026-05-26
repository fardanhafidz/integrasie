import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateIntake, IntakeError } from '../../src/server/modules/intake/intake.service';

/**
 * Unit tests for intake data immutability enforcement.
 *
 * Validates: Requirements 2.4
 * "WHEN a Lot_Number is generated, THE Platform SHALL lock the associated
 * Supplier_Intake data to prevent modification by any user, with no override
 * mechanism available"
 */

// Mock Prisma
vi.mock('../../src/server/config/database', () => ({
  prisma: {
    supplierIntake: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/server/config/database';

const mockFindUnique = prisma.supplierIntake.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.supplierIntake.update as ReturnType<typeof vi.fn>;

describe('Intake Immutability (Requirement 2.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateIntake', () => {
    it('should throw 403 IntakeError when intake is locked', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'intake-1',
        supplier_name: 'Test Supplier',
        material_group: 'Raw Chemical',
        material_group_code: 'RC',
        quantity: 100,
        unit: 'kg',
        delivery_date: new Date('2025-01-15'),
        truck_reference: 'TRK001',
        is_locked: true,
        created_by: 'user-1',
        created_at: new Date(),
      });

      await expect(
        updateIntake('intake-1', { supplier_name: 'Modified Supplier' })
      ).rejects.toThrow(IntakeError);

      await expect(
        updateIntake('intake-1', { supplier_name: 'Modified Supplier' })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: 'Intake data is locked and cannot be modified after lot generation',
      });

      // Ensure no update was attempted
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should throw 404 IntakeError when intake does not exist', async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        updateIntake('non-existent-id', { supplier_name: 'Test' })
      ).rejects.toThrow(IntakeError);

      await expect(
        updateIntake('non-existent-id', { supplier_name: 'Test' })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Intake not found',
      });

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should reject modification of any field on a locked intake', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'intake-1',
        supplier_name: 'Test Supplier',
        material_group: 'Raw Chemical',
        material_group_code: 'RC',
        quantity: 100,
        unit: 'kg',
        delivery_date: new Date('2025-01-15'),
        truck_reference: 'TRK001',
        is_locked: true,
        created_by: 'user-1',
        created_at: new Date(),
      });

      // Try modifying different fields — all should be rejected
      const fieldsToModify = [
        { supplier_name: 'New Name' },
        { quantity: 999 },
        { delivery_date: '2025-02-01' },
        { truck_reference: 'NEWTRK' },
        { material_group: 'Solvent' },
        { is_locked: false }, // Even trying to unlock should be rejected
      ];

      for (const data of fieldsToModify) {
        await expect(updateIntake('intake-1', data)).rejects.toMatchObject({
          statusCode: 403,
        });
      }

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should allow update if intake is not locked (edge case)', async () => {
      const unlockedIntake = {
        id: 'intake-2',
        supplier_name: 'Test Supplier',
        material_group: 'Raw Chemical',
        material_group_code: 'RC',
        quantity: 100,
        unit: 'kg',
        delivery_date: new Date('2025-01-15'),
        truck_reference: 'TRK001',
        is_locked: false,
        created_by: 'user-1',
        created_at: new Date(),
      };

      mockFindUnique.mockResolvedValue(unlockedIntake);
      mockUpdate.mockResolvedValue({
        ...unlockedIntake,
        supplier_name: 'Updated Supplier',
      });

      // Should not throw for unlocked intake
      const result = await updateIntake('intake-2', { supplier_name: 'Updated Supplier' });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'intake-2' },
        data: { supplier_name: 'Updated Supplier' },
      });
    });
  });
});
