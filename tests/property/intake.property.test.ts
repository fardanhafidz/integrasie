/**
 * Property-Based Test: Supplier Intake Immutability
 *
 * Feature: integrasie-smart-dashboard, Property 4: Supplier Intake Immutability
 *
 * Validates: Requirements 2.4
 *
 * Property: For any supplier intake that has an associated lot, no field of the
 * intake record can be modified after lot generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock Prisma before importing the service
vi.mock('@server/config/database', () => ({
  prisma: {
    supplierIntake: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '@server/config/database';
import { updateIntake, IntakeError } from '@server/modules/intake/intake.service';

// Fields that can be modified on a supplier intake
const INTAKE_FIELDS = [
  'supplier_name',
  'material_group',
  'quantity',
  'unit',
  'delivery_date',
  'truck_reference',
  'is_locked',
] as const;

type IntakeField = (typeof INTAKE_FIELDS)[number];

/**
 * Arbitrary: generates a random locked supplier intake record
 */
const lockedIntakeArb = fc.record({
  id: fc.uuid(),
  supplier_name: fc.string({ minLength: 1, maxLength: 100 }),
  material_group: fc.constantFrom('Chemicals', 'Solvents', 'Resins', 'Oils'),
  material_group_code: fc.constantFrom('CH', 'SV', 'RS', 'OL'),
  quantity: fc.integer({ min: 1, max: 99999 }).map((n) => n / 100),
  unit: fc.constantFrom('kg', 'L', 'drums', 'tons'),
  delivery_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  truck_reference: fc.stringMatching(/^[A-Za-z0-9]{1,50}$/),
  is_locked: fc.constant(true),
  created_by: fc.uuid(),
  created_at: fc.date(),
});

/**
 * Arbitrary: generates a random field modification attempt (single field)
 */
const singleFieldModificationArb = fc.constantFrom(...INTAKE_FIELDS).chain((field) => {
  let valueArb: fc.Arbitrary<unknown>;
  switch (field) {
    case 'supplier_name':
      valueArb = fc.string({ minLength: 1, maxLength: 100 });
      break;
    case 'material_group':
      valueArb = fc.constantFrom('NewGroup', 'Modified', 'Changed');
      break;
    case 'quantity':
      valueArb = fc.integer({ min: 1, max: 99999 }).map((n) => n / 100);
      break;
    case 'unit':
      valueArb = fc.constantFrom('kg', 'L', 'drums', 'tons', 'barrels');
      break;
    case 'delivery_date':
      valueArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
        (d) => d.toISOString().split('T')[0]
      );
      break;
    case 'truck_reference':
      valueArb = fc.stringMatching(/^[A-Za-z0-9]{1,50}$/);
      break;
    case 'is_locked':
      valueArb = fc.constant(false);
      break;
    default:
      valueArb = fc.string();
  }
  return valueArb.map((value) => ({ field, value }));
});

/**
 * Arbitrary: generates a random set of fields to modify (1 to all fields)
 */
const multiFieldModificationArb = fc
  .subarray([...INTAKE_FIELDS], { minLength: 1 })
  .chain((fields) => {
    const entries = fields.map((field) => {
      let valueArb: fc.Arbitrary<unknown>;
      switch (field) {
        case 'supplier_name':
          valueArb = fc.string({ minLength: 1, maxLength: 100 });
          break;
        case 'material_group':
          valueArb = fc.constantFrom('NewGroup', 'Modified', 'Changed');
          break;
        case 'quantity':
          valueArb = fc.integer({ min: 1, max: 99999 }).map((n) => n / 100);
          break;
        case 'unit':
          valueArb = fc.constantFrom('kg', 'L', 'drums', 'tons', 'barrels');
          break;
        case 'delivery_date':
          valueArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(
            (d) => d.toISOString().split('T')[0]
          );
          break;
        case 'truck_reference':
          valueArb = fc.stringMatching(/^[A-Za-z0-9]{1,50}$/);
          break;
        case 'is_locked':
          valueArb = fc.constant(false);
          break;
        default:
          valueArb = fc.string();
      }
      return valueArb.map((value) => [field, value] as [string, unknown]);
    });
    return fc.tuple(...entries).map((pairs) => Object.fromEntries(pairs));
  });

describe('Feature: integrasie-smart-dashboard, Property 4: Supplier Intake Immutability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 4a: For any locked intake and any random field modification attempt,
   * updateIntake always throws IntakeError with statusCode 403.
   *
   * Validates: Requirements 2.4
   */
  it('Property 4a: updateIntake always throws IntakeError(403) for any single field modification on a locked intake', async () => {
    await fc.assert(
      fc.asyncProperty(
        lockedIntakeArb,
        singleFieldModificationArb,
        async (intake, modification) => {
          // Mock Prisma to return the locked intake
          vi.mocked(prisma.supplierIntake.findUnique).mockResolvedValue(intake as any);

          const updateData = { [modification.field]: modification.value };

          // Attempt to update should always throw
          try {
            await updateIntake(intake.id, updateData);
            // If we reach here, the test fails — update should never succeed
            expect.fail('updateIntake should have thrown IntakeError for locked intake');
          } catch (error) {
            expect(error).toBeInstanceOf(IntakeError);
            expect((error as IntakeError).statusCode).toBe(403);
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4b: For any random set of fields (supplier_name, material_group,
   * quantity, unit, delivery_date, truck_reference, is_locked), all modification
   * attempts on a locked intake are rejected.
   *
   * Validates: Requirements 2.4
   */
  it('Property 4b: updateIntake rejects all multi-field modification attempts on a locked intake', async () => {
    await fc.assert(
      fc.asyncProperty(
        lockedIntakeArb,
        multiFieldModificationArb,
        async (intake, modifications) => {
          // Mock Prisma to return the locked intake
          vi.mocked(prisma.supplierIntake.findUnique).mockResolvedValue(intake as any);

          // Attempt to update with multiple fields should always throw
          try {
            await updateIntake(intake.id, modifications);
            expect.fail('updateIntake should have thrown IntakeError for locked intake');
          } catch (error) {
            expect(error).toBeInstanceOf(IntakeError);
            expect((error as IntakeError).statusCode).toBe(403);
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4c: The error message always indicates the intake is locked.
   *
   * Validates: Requirements 2.4
   */
  it('Property 4c: The error message always indicates the intake is locked when modification is attempted', async () => {
    await fc.assert(
      fc.asyncProperty(
        lockedIntakeArb,
        singleFieldModificationArb,
        async (intake, modification) => {
          // Mock Prisma to return the locked intake
          vi.mocked(prisma.supplierIntake.findUnique).mockResolvedValue(intake as any);

          const updateData = { [modification.field]: modification.value };

          try {
            await updateIntake(intake.id, updateData);
            expect.fail('updateIntake should have thrown IntakeError for locked intake');
          } catch (error) {
            expect(error).toBeInstanceOf(IntakeError);
            const intakeError = error as IntakeError;
            // The error message must indicate the intake is locked
            expect(intakeError.message.toLowerCase()).toContain('locked');
            expect(intakeError.message.toLowerCase()).toContain('cannot be modified');
          }
        }
      ),
      { numRuns: 100 },
    );
  });
});
