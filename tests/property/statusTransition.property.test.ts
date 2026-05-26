/**
 * Property-Based Test: Lot Status State Machine
 *
 * Feature: integrasie-smart-dashboard, Property 3: Lot Status State Machine
 *
 * Validates: Requirements 2.3, 3.4, 3.5
 *
 * Property: For any lot, the status transitions follow the valid state machine:
 * `pending_qc → passed | rejected`, `passed → ready_to_store`.
 * No other transitions are permitted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { LotStatus } from '@server/shared/types';
import {
  VALID_TRANSITIONS,
  isValidTransition,
  getValidNextStatuses,
  transitionLotStatus,
} from '@server/modules/qc/statusMachine';

// Mock Prisma and notification service
vi.mock('@server/config/database', () => ({
  prisma: {
    lot: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@server/modules/notification/notification.service', () => ({
  emitLotReadyToStore: vi.fn(),
}));

import { prisma } from '@server/config/database';

// All valid LotStatus values
const ALL_STATUSES = Object.values(LotStatus);

// Arbitrary for any LotStatus
const lotStatusArb = fc.constantFrom(...ALL_STATUSES);

// Generate all valid transition pairs from VALID_TRANSITIONS
const validTransitionPairs: [LotStatus, LotStatus][] = [];
for (const [from, toList] of Object.entries(VALID_TRANSITIONS)) {
  for (const to of toList) {
    validTransitionPairs.push([from as LotStatus, to]);
  }
}

// Generate all invalid transition pairs (not in VALID_TRANSITIONS)
const invalidTransitionPairs: [LotStatus, LotStatus][] = [];
for (const from of ALL_STATUSES) {
  for (const to of ALL_STATUSES) {
    if (!VALID_TRANSITIONS[from].includes(to)) {
      invalidTransitionPairs.push([from, to]);
    }
  }
}

// Arbitrary for valid transition pairs
const validTransitionArb = fc.constantFrom(...validTransitionPairs);

// Arbitrary for invalid transition pairs
const invalidTransitionArb = fc.constantFrom(...invalidTransitionPairs);

// Terminal states: states with no valid next statuses
const terminalStates = ALL_STATUSES.filter(
  (status) => VALID_TRANSITIONS[status].length === 0
);

describe('Feature: integrasie-smart-dashboard, Property 3: Lot Status State Machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 3a: For any valid transition pair (from VALID_TRANSITIONS),
   * isValidTransition returns true.
   *
   * Validates: Requirements 2.3, 3.4, 3.5
   */
  it('Property 3a: isValidTransition returns true for all valid transition pairs', () => {
    fc.assert(
      fc.property(validTransitionArb, ([fromStatus, toStatus]) => {
        const result = isValidTransition(fromStatus, toStatus);
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3b: For any invalid transition pair (not in VALID_TRANSITIONS),
   * isValidTransition returns false.
   *
   * Validates: Requirements 2.3, 3.4, 3.5
   */
  it('Property 3b: isValidTransition returns false for all invalid transition pairs', () => {
    fc.assert(
      fc.property(invalidTransitionArb, ([fromStatus, toStatus]) => {
        const result = isValidTransition(fromStatus, toStatus);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3c: For any sequence of random status transition attempts,
   * only valid transitions succeed (transitionLotStatus with mocked Prisma).
   *
   * Validates: Requirements 2.3, 3.4, 3.5
   */
  it('Property 3c: For random transition sequences, only valid transitions succeed', () => {
    fc.assert(
      fc.asyncProperty(
        lotStatusArb,
        fc.array(lotStatusArb, { minLength: 1, maxLength: 5 }),
        fc.uuid(),
        fc.uuid(),
        async (initialStatus, transitionAttempts, lotId, userId) => {
          let currentStatus = initialStatus;

          for (const attemptedStatus of transitionAttempts) {
            // Mock the lot with current status
            vi.mocked(prisma.lot.findUnique).mockResolvedValue({
              id: lotId,
              status: currentStatus,
              lot_number: 'TEST-20240101-0001',
              supplier_intake_id: 'intake-id',
              material_group_code: 'RM',
              is_temperature_sensitive: false,
              is_hazardous: false,
              hazard_class: null,
              created_at: new Date(),
              updated_at: new Date(),
            } as any);

            vi.mocked(prisma.lot.update).mockResolvedValue({
              id: lotId,
              status: attemptedStatus,
              lot_number: 'TEST-20240101-0001',
              supplier_intake_id: 'intake-id',
              material_group_code: 'RM',
              is_temperature_sensitive: false,
              is_hazardous: false,
              hazard_class: null,
              created_at: new Date(),
              updated_at: new Date(),
              supplier_intake: { material_group: 'Raw Material' },
            } as any);

            const shouldSucceed = isValidTransition(
              currentStatus,
              attemptedStatus
            );

            if (shouldSucceed) {
              // Valid transition: should succeed without throwing
              const result = await transitionLotStatus(
                lotId,
                attemptedStatus,
                userId
              );
              expect(result).toBeDefined();
              expect(result.status).toBe(attemptedStatus);
              // Update current status for next iteration
              currentStatus = attemptedStatus;
            } else {
              // Invalid transition: should throw an error
              await expect(
                transitionLotStatus(lotId, attemptedStatus, userId)
              ).rejects.toThrow();
              // Current status remains unchanged
            }
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3d: Terminal states (rejected, ready_to_store) have no valid
   * next statuses.
   *
   * Validates: Requirements 2.3, 3.4, 3.5
   */
  it('Property 3d: Terminal states have no valid next statuses', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...terminalStates),
        lotStatusArb,
        (terminalStatus, anyStatus) => {
          // Terminal states should have empty valid next statuses
          const validNext = getValidNextStatuses(terminalStatus);
          expect(validNext).toHaveLength(0);

          // Any transition from a terminal state should be invalid
          const result = isValidTransition(terminalStatus, anyStatus);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Additional invariant: For any random pair of LotStatus values,
   * the state machine invariant holds — isValidTransition is consistent
   * with VALID_TRANSITIONS.
   *
   * Validates: Requirements 2.3, 3.4, 3.5
   */
  it('Property 3e: Random status pairs are consistent with VALID_TRANSITIONS map', () => {
    fc.assert(
      fc.property(lotStatusArb, lotStatusArb, (fromStatus, toStatus) => {
        const result = isValidTransition(fromStatus, toStatus);
        const expected = VALID_TRANSITIONS[fromStatus].includes(toStatus);
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
