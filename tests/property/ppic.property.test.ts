/**
 * Property-Based Tests: PPIC Stock Validation
 *
 * Feature: integrasie-smart-dashboard, Property 10: PPIC Stock Validation
 *
 * Validates: Requirements 8.4, 8.6
 *
 * "For any production schedule, every referenced lot has status 'ready_to_store'
 * at the time of schedule creation. Schedules referencing lots with any other
 * status are rejected."
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { LotStatus, ScheduleStatus } from '@prisma/client';

// Use vi.hoisted to define mocks that can be referenced in vi.mock factories
const mockPrisma = vi.hoisted(() => ({
  lot: {
    findMany: vi.fn(),
  },
  productionSchedule: {
    create: vi.fn(),
  },
}));

// Mock Socket.IO to prevent initialization errors
vi.mock('@server/index', () => ({
  io: { emit: vi.fn() },
}));

// Mock Prisma
vi.mock('@server/config/database', () => ({
  prisma: mockPrisma,
}));

import {
  createSchedule,
  PPICValidationError,
  PPICStockConflictError,
  type ScheduleInput,
} from '@server/modules/ppic/ppic.service';

// ─── Generators ──────────────────────────────────────────────────────────────

const uuidArb = fc.uuid();

const lotStatusArb = fc.constantFrom(
  LotStatus.pending_qc,
  LotStatus.passed,
  LotStatus.rejected,
  LotStatus.ready_to_store
);

const nonReadyStatusArb = fc.constantFrom(
  LotStatus.pending_qc,
  LotStatus.passed,
  LotStatus.rejected
);

const validTitleArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

const validDateArb = fc.date({
  min: new Date('2020-01-01'),
  max: new Date('2030-12-31'),
}).map((d) => d.toISOString().slice(0, 10));

const lotNumberArb = fc
  .tuple(
    fc.stringMatching(/^[A-Z]{2,5}$/),
    fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    fc.integer({ min: 1, max: 9999 })
  )
  .map(([code, date, seq]) => {
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    return `${code}-${dateStr}-${String(seq).padStart(4, '0')}`;
  });

// Generate a valid schedule input with 1-5 lots
const scheduleInputArb = (lotIds: string[]) =>
  fc.record({
    title: validTitleArb,
    scheduled_date: validDateArb,
    lots: fc.constant(
      lotIds.map((id) => ({
        lot_id: id,
        quantity_required: 10, // Will be controlled per-property
      }))
    ),
  });

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Feature: integrasie-smart-dashboard, Property 10: PPIC Stock Validation', () => {
  const userId = 'test-user-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 10a: For any schedule where all lots have status 'ready_to_store'
   * and sufficient quantity, createSchedule succeeds.
   *
   * **Validates: Requirements 8.4**
   */
  it('Property 10a: schedules with all lots having ready_to_store status and sufficient quantity succeed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 lot IDs
        fc.array(uuidArb, { minLength: 1, maxLength: 5 }),
        // Generate lot numbers for each lot
        fc.array(lotNumberArb, { minLength: 5, maxLength: 5 }),
        // Generate quantity required (1-100)
        fc.integer({ min: 1, max: 100 }),
        // Generate available quantity (will be >= required)
        fc.integer({ min: 100, max: 1000 }),
        validTitleArb,
        validDateArb,
        async (lotIds, lotNumbers, quantityRequired, availableQuantity, title, scheduledDate) => {
          // Ensure unique lot IDs
          const uniqueLotIds = [...new Set(lotIds)];
          if (uniqueLotIds.length === 0) return;

          const input: ScheduleInput = {
            title,
            scheduled_date: scheduledDate,
            lots: uniqueLotIds.map((id) => ({
              lot_id: id,
              quantity_required: quantityRequired,
            })),
          };

          // Mock: all lots exist with status ready_to_store and sufficient quantity
          const mockLots = uniqueLotIds.map((id, i) => ({
            id,
            lot_number: lotNumbers[i % lotNumbers.length],
            status: LotStatus.ready_to_store,
            supplier_intake: {
              quantity: availableQuantity, // Always >= quantityRequired
            },
            production_schedule_lots: [], // No existing reservations
          }));

          mockPrisma.lot.findMany.mockResolvedValue(mockLots);

          // Mock: schedule creation succeeds
          const mockSchedule = {
            id: 'schedule-id',
            title: input.title.trim(),
            scheduled_date: new Date(input.scheduled_date),
            status: ScheduleStatus.draft,
            created_by: userId,
            lots: uniqueLotIds.map((id, i) => ({
              lot_id: id,
              quantity_required: quantityRequired,
              lot: {
                id,
                lot_number: lotNumbers[i % lotNumbers.length],
                material_group_code: 'RM',
                status: LotStatus.ready_to_store,
              },
            })),
            creator: { id: userId, full_name: 'Test User', email: 'test@test.com' },
          };
          mockPrisma.productionSchedule.create.mockResolvedValue(mockSchedule);

          // Should NOT throw
          const result = await createSchedule(input, userId);
          expect(result).toBeDefined();
          expect(result.status).toBe(ScheduleStatus.draft);
          expect(mockPrisma.productionSchedule.create).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 10b: For any schedule where at least one lot does NOT have status
   * 'ready_to_store', createSchedule throws PPICValidationError.
   *
   * **Validates: Requirements 8.6**
   */
  it('Property 10b: schedules with at least one lot not having ready_to_store status are rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 lot IDs
        fc.array(uuidArb, { minLength: 1, maxLength: 5 }),
        // Generate lot numbers
        fc.array(lotNumberArb, { minLength: 5, maxLength: 5 }),
        // Generate a non-ready status for at least one lot
        nonReadyStatusArb,
        // Index of the lot that will have invalid status
        fc.nat(),
        validTitleArb,
        validDateArb,
        async (lotIds, lotNumbers, invalidStatus, invalidIndex, title, scheduledDate) => {
          // Ensure unique lot IDs
          const uniqueLotIds = [...new Set(lotIds)];
          if (uniqueLotIds.length === 0) return;

          const input: ScheduleInput = {
            title,
            scheduled_date: scheduledDate,
            lots: uniqueLotIds.map((id) => ({
              lot_id: id,
              quantity_required: 10,
            })),
          };

          // At least one lot has a non-ready_to_store status
          const badLotIndex = invalidIndex % uniqueLotIds.length;

          const mockLots = uniqueLotIds.map((id, i) => ({
            id,
            lot_number: lotNumbers[i % lotNumbers.length],
            status: i === badLotIndex ? invalidStatus : LotStatus.ready_to_store,
            supplier_intake: {
              quantity: 1000,
            },
            production_schedule_lots: [],
          }));

          mockPrisma.lot.findMany.mockResolvedValue(mockLots);

          // Should throw PPICValidationError
          await expect(createSchedule(input, userId)).rejects.toThrow(PPICValidationError);
          // Schedule should NOT be created
          expect(mockPrisma.productionSchedule.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 10c: For any schedule where requested quantity exceeds available
   * (unreserved) quantity, createSchedule throws PPICStockConflictError.
   *
   * **Validates: Requirements 8.4**
   */
  it('Property 10c: schedules where requested quantity exceeds available unreserved stock are rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 lot IDs
        fc.array(uuidArb, { minLength: 1, maxLength: 5 }),
        // Generate lot numbers
        fc.array(lotNumberArb, { minLength: 5, maxLength: 5 }),
        // Generate total quantity available (1-100)
        fc.integer({ min: 1, max: 100 }),
        // Generate already reserved quantity (0 to totalQuantity-1)
        fc.integer({ min: 0, max: 99 }),
        // Generate excess amount to request beyond available (1-100)
        fc.integer({ min: 1, max: 100 }),
        validTitleArb,
        validDateArb,
        async (lotIds, lotNumbers, totalQuantity, reservedBase, excess, title, scheduledDate) => {
          // Ensure unique lot IDs
          const uniqueLotIds = [...new Set(lotIds)];
          if (uniqueLotIds.length === 0) return;

          // Ensure reserved doesn't exceed total
          const reserved = Math.min(reservedBase, totalQuantity - 1);
          const available = totalQuantity - reserved;
          // Request more than available
          const requestedQuantity = available + excess;

          const input: ScheduleInput = {
            title,
            scheduled_date: scheduledDate,
            lots: uniqueLotIds.map((id) => ({
              lot_id: id,
              quantity_required: requestedQuantity,
            })),
          };

          // All lots have ready_to_store status but insufficient unreserved quantity
          const mockLots = uniqueLotIds.map((id, i) => ({
            id,
            lot_number: lotNumbers[i % lotNumbers.length],
            status: LotStatus.ready_to_store,
            supplier_intake: {
              quantity: totalQuantity,
            },
            production_schedule_lots: reserved > 0
              ? [{ quantity_required: reserved }]
              : [],
          }));

          mockPrisma.lot.findMany.mockResolvedValue(mockLots);

          // Should throw PPICStockConflictError
          await expect(createSchedule(input, userId)).rejects.toThrow(PPICStockConflictError);
          // Schedule should NOT be created
          expect(mockPrisma.productionSchedule.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});
