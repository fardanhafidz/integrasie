/**
 * Property-Based Tests: Audit Trail Completeness & Append-Only
 *
 * Feature: integrasie-smart-dashboard, Property 8: Audit Trail Completeness
 * Feature: integrasie-smart-dashboard, Property 9: Audit Trail Append-Only
 *
 * Validates: Requirements 6.1, 6.2, 6.3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// In-memory audit record store used by the mock
let auditRecords: Array<{
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: unknown;
  new_value: unknown;
  timestamp: Date;
}> = [];

let idCounter = 0;

// Mock Prisma to track all created records in an array and verify count/immutability
vi.mock('@server/config/database', () => {
  return {
    prisma: {
      auditTrail: {
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

import { prisma } from '@server/config/database';
import { recordAudit, ensureRecorded, type AuditParams } from '@server/modules/audit/audit.service';

describe('Feature: integrasie-smart-dashboard, Property 8: Audit Trail Completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock prisma.auditTrail.create to capture and return the data
    vi.mocked(prisma.auditTrail.create).mockImplementation(async (args: any) => {
      idCounter++;
      const record = {
        id: `audit-${String(idCounter).padStart(4, '0')}`,
        user_id: args.data.user_id,
        action: args.data.action,
        entity_type: args.data.entity_type,
        entity_id: args.data.entity_id,
        old_value: args.data.old_value,
        new_value: args.data.new_value,
        timestamp: args.data.timestamp,
      };
      return record;
    });
  });

  // Arbitrary for generating valid AuditParams
  const auditParamsArb = fc.record({
    userId: fc.uuid(),
    action: fc.oneof(
      fc.constant('lot_status_change'),
      fc.constant('drum_placement'),
      fc.constant('drum_location_change'),
      fc.constant('slot_override'),
      fc.constant('qc_decision')
    ),
    entityType: fc.oneof(
      fc.constant('lot'),
      fc.constant('drum'),
      fc.constant('rack_slot')
    ),
    entityId: fc.uuid(),
    oldValue: fc.oneof(
      fc.constant(null),
      fc.record({
        status: fc.constantFrom('pending_qc', 'passed', 'rejected', 'ready_to_store'),
      })
    ),
    newValue: fc.record({
      status: fc.constantFrom('pending_qc', 'passed', 'rejected', 'ready_to_store'),
    }),
  });

  /**
   * Property 8a: For any random audit params (userId, action, entityType, entityId, oldValue, newValue),
   * recordAudit creates a record with all matching fields.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('Property 8a: recordAudit creates a record with all matching fields for any audit params', async () => {
    await fc.assert(
      fc.asyncProperty(
        auditParamsArb,
        async (params) => {
          vi.clearAllMocks();

          let capturedData: any = null;
          vi.mocked(prisma.auditTrail.create).mockImplementation(async (args: any) => {
            capturedData = args.data;
            return {
              id: 'mock-id',
              ...args.data,
            };
          });

          await recordAudit(params as AuditParams);

          // Verify all fields match the input
          expect(capturedData).not.toBeNull();
          expect(capturedData.user_id).toBe(params.userId);
          expect(capturedData.action).toBe(params.action);
          expect(capturedData.entity_type).toBe(params.entityType);
          expect(capturedData.entity_id).toBe(params.entityId);
          expect(capturedData.new_value).toEqual(params.newValue);

          // old_value: when null, the code uses Prisma.JsonNull sentinel
          if (params.oldValue === null) {
            expect(capturedData.old_value).toBeDefined();
          } else {
            expect(capturedData.old_value).toEqual(params.oldValue);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8b: The created record always has a timestamp that is close to the current time (within 1 second).
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('Property 8b: the created record always has a timestamp close to the current time (within 1 second)', async () => {
    await fc.assert(
      fc.asyncProperty(
        auditParamsArb,
        async (params) => {
          vi.clearAllMocks();

          let capturedTimestamp: Date | null = null;
          vi.mocked(prisma.auditTrail.create).mockImplementation(async (args: any) => {
            capturedTimestamp = args.data.timestamp;
            return {
              id: 'mock-id',
              ...args.data,
            };
          });

          const beforeCall = new Date();

          await recordAudit(params as AuditParams);

          const afterCall = new Date();

          // The timestamp should be a Date instance
          expect(capturedTimestamp).toBeInstanceOf(Date);

          // The timestamp should be between beforeCall and afterCall (within 1 second tolerance)
          const ts = (capturedTimestamp as Date).getTime();
          expect(ts).toBeGreaterThanOrEqual(beforeCall.getTime() - 1000);
          expect(ts).toBeLessThanOrEqual(afterCall.getTime() + 1000);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8c: The old_value and new_value in the created record match the input exactly.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  it('Property 8c: old_value and new_value in the created record match the input exactly', async () => {
    // Use non-null old_value to test exact matching
    const nonNullAuditParamsArb = fc.record({
      userId: fc.uuid(),
      action: fc.oneof(
        fc.constant('lot_status_change'),
        fc.constant('drum_placement'),
        fc.constant('drum_location_change')
      ),
      entityType: fc.oneof(fc.constant('lot'), fc.constant('drum')),
      entityId: fc.uuid(),
      oldValue: fc.record({
        status: fc.constantFrom('pending_qc', 'passed', 'rejected', 'ready_to_store'),
        location: fc.stringMatching(/^[A-Za-z0-9]{3,10}$/),
      }),
      newValue: fc.record({
        status: fc.constantFrom('pending_qc', 'passed', 'rejected', 'ready_to_store'),
        location: fc.stringMatching(/^[A-Za-z0-9]{3,10}$/),
      }),
    });

    await fc.assert(
      fc.asyncProperty(
        nonNullAuditParamsArb,
        async (params) => {
          vi.clearAllMocks();

          let capturedData: any = null;
          vi.mocked(prisma.auditTrail.create).mockImplementation(async (args: any) => {
            capturedData = args.data;
            return {
              id: 'mock-id',
              ...args.data,
            };
          });

          await recordAudit(params as AuditParams);

          // old_value and new_value must match input exactly
          expect(capturedData.old_value).toEqual(params.oldValue);
          expect(capturedData.new_value).toEqual(params.newValue);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: integrasie-smart-dashboard, Property 9: Audit Trail Append-Only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditRecords = [];
    idCounter = 0;

    // Mock $transaction to simulate transactional behavior with in-memory store
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = {
        auditTrail: {
          create: vi.fn().mockImplementation(async (args: any) => {
            idCounter++;
            const record = {
              id: `audit-${String(idCounter).padStart(4, '0')}`,
              user_id: args.data.user_id,
              action: args.data.action,
              entity_type: args.data.entity_type,
              entity_id: args.data.entity_id,
              old_value: args.data.old_value,
              new_value: args.data.new_value,
              timestamp: args.data.timestamp,
            };
            auditRecords.push(record);
            return record;
          }),
        },
      };
      return fn(tx);
    });
  });

  // Arbitrary for generating valid AuditParams
  const auditParamsArb = fc.record({
    userId: fc.uuid(),
    action: fc.oneof(
      fc.constant('lot_status_change'),
      fc.constant('drum_placement'),
      fc.constant('drum_location_change'),
      fc.constant('slot_override'),
      fc.constant('qc_decision')
    ),
    entityType: fc.oneof(
      fc.constant('lot'),
      fc.constant('drum'),
      fc.constant('rack_slot')
    ),
    entityId: fc.uuid(),
    oldValue: fc.oneof(
      fc.constant(null),
      fc.record({ status: fc.string({ minLength: 1, maxLength: 20 }) })
    ),
    newValue: fc.record({ status: fc.string({ minLength: 1, maxLength: 20 }) }),
  });

  /**
   * Property 9a: For any sequence of N ensureRecorded calls, the total count
   * of records is always N (monotonically increasing).
   *
   * **Validates: Requirements 6.3**
   */
  it('Property 9a: for any sequence of N recordAudit calls, the total count of records is always N (monotonically increasing)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(auditParamsArb, { minLength: 1, maxLength: 20 }),
        async (paramsList) => {
          // Reset state for each run
          auditRecords = [];
          idCounter = 0;

          let previousCount = 0;

          for (let i = 0; i < paramsList.length; i++) {
            const params = paramsList[i] as AuditParams;

            await ensureRecorded(async () => ({ success: true }), params);

            const currentCount = auditRecords.length;

            // Count must be monotonically increasing
            expect(currentCount).toBeGreaterThan(previousCount);
            // Count must equal the number of successful calls so far
            expect(currentCount).toBe(i + 1);

            previousCount = currentCount;
          }

          // Final count must equal total number of calls
          expect(auditRecords.length).toBe(paramsList.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9b: For any audit record created, calling ensureRecorded again with
   * different data does not modify existing records (new record is created instead).
   *
   * **Validates: Requirements 6.3**
   */
  it('Property 9b: for any audit record created, calling recordAudit again with different data does not modify existing records', async () => {
    await fc.assert(
      fc.asyncProperty(
        auditParamsArb,
        auditParamsArb,
        async (firstParams, secondParams) => {
          // Reset state for each run
          auditRecords = [];
          idCounter = 0;

          // Create first audit record
          await ensureRecorded(async () => ({ result: 'first' }), firstParams as AuditParams);

          // Snapshot the first record
          const firstRecordSnapshot = { ...auditRecords[0] };

          // Create second audit record with different data
          await ensureRecorded(async () => ({ result: 'second' }), secondParams as AuditParams);

          // Verify the first record was NOT modified
          expect(auditRecords[0]).toEqual(firstRecordSnapshot);

          // Verify a new record was created (not overwritten)
          expect(auditRecords.length).toBe(2);

          // Verify the second record is distinct from the first
          expect(auditRecords[1].id).not.toBe(auditRecords[0].id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9c: The ensureRecorded function always creates exactly one new
   * audit record per successful operation.
   *
   * **Validates: Requirements 6.3**
   */
  it('Property 9c: ensureRecorded always creates exactly one new audit record per successful operation', async () => {
    await fc.assert(
      fc.asyncProperty(
        auditParamsArb,
        async (params) => {
          // Reset state for each run
          auditRecords = [];
          idCounter = 0;

          const countBefore = auditRecords.length;

          await ensureRecorded(async () => ({ done: true }), params as AuditParams);

          const countAfter = auditRecords.length;

          // Exactly one record was added
          expect(countAfter - countBefore).toBe(1);

          // The created record matches the input params
          const createdRecord = auditRecords[auditRecords.length - 1];
          expect(createdRecord.user_id).toBe(params.userId);
          expect(createdRecord.action).toBe(params.action);
          expect(createdRecord.entity_type).toBe(params.entityType);
          expect(createdRecord.entity_id).toBe(params.entityId);
          expect(createdRecord.timestamp).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 100 }
    );
  });
});
