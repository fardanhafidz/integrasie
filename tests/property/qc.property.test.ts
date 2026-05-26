/**
 * Property-Based Test: QC Decision Completeness
 *
 * Feature: integrasie-smart-dashboard, Property 12: QC Decision Completeness
 *
 * Validates: Requirements 3.3, 3.5, 3.7
 *
 * Property: For any QC submission, a decision of "Passed" or "Rejected" is required.
 * Submissions without quality parameters are rejected. Rejected decisions require
 * a non-empty rejection reason.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { qcSubmissionSchema } from '@server/modules/qc/qc.validators';

/**
 * Arbitrary: generates a non-empty parameters object with at least one key-value pair.
 * Values are either strings or numbers as required by the schema.
 */
const validParametersArb = fc
  .dictionary(
    fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/).filter((s) => s.length >= 1 && s.length <= 30),
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.float({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true })
    )
  )
  .filter((params) => Object.keys(params).length >= 1);

/**
 * Arbitrary: generates an empty parameters object ({}).
 */
const emptyParametersArb = fc.constant({});

/**
 * Arbitrary: generates a valid rejection reason string (10-500 chars).
 */
const validRejectionReasonArb = fc
  .string({ minLength: 10, maxLength: 500 })
  .filter((s) => s.trim().length >= 10);

/**
 * Arbitrary: generates an invalid rejection reason (too short: < 10 chars).
 */
const shortRejectionReasonArb = fc.string({ minLength: 1, maxLength: 9 });

/**
 * Arbitrary: generates a valid decision value.
 */
const validDecisionArb = fc.constantFrom('passed', 'rejected');

describe('Feature: integrasie-smart-dashboard, Property 12: QC Decision Completeness', () => {
  /**
   * Property 12a: For any valid QC submission with at least one parameter
   * and a valid decision, the schema accepts it.
   *
   * Validates: Requirements 3.3
   */
  it('Property 12a: Valid QC submission with at least one parameter and valid decision is accepted', () => {
    fc.assert(
      fc.property(
        validParametersArb,
        validDecisionArb,
        validRejectionReasonArb,
        (parameters, decision, rejectionReason) => {
          const submission: Record<string, unknown> = {
            parameters,
            decision,
          };

          // Add rejection_reason only when decision is 'rejected'
          if (decision === 'rejected') {
            submission.rejection_reason = rejectionReason;
          }

          const result = qcSubmissionSchema.safeParse(submission);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12b: For any submission with empty parameters ({}),
   * the schema rejects it.
   *
   * Validates: Requirements 3.7
   */
  it('Property 12b: Submission with empty parameters is rejected', () => {
    fc.assert(
      fc.property(
        emptyParametersArb,
        validDecisionArb,
        validRejectionReasonArb,
        (parameters, decision, rejectionReason) => {
          const submission: Record<string, unknown> = {
            parameters,
            decision,
          };

          if (decision === 'rejected') {
            submission.rejection_reason = rejectionReason;
          }

          const result = qcSubmissionSchema.safeParse(submission);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12c: For any submission with decision 'rejected' and
   * rejection_reason < 10 chars or null/undefined, the schema rejects it.
   *
   * Validates: Requirements 3.5
   */
  it('Property 12c: Rejected decision with short or missing rejection_reason is rejected', () => {
    fc.assert(
      fc.property(
        validParametersArb,
        fc.oneof(
          shortRejectionReasonArb,
          fc.constant(null),
          fc.constant(undefined)
        ),
        (parameters, rejectionReason) => {
          const submission: Record<string, unknown> = {
            parameters,
            decision: 'rejected',
          };

          if (rejectionReason !== undefined) {
            submission.rejection_reason = rejectionReason;
          }

          const result = qcSubmissionSchema.safeParse(submission);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12d: For any submission with decision 'rejected' and
   * rejection_reason between 10-500 chars, the schema accepts it.
   *
   * Validates: Requirements 3.5
   */
  it('Property 12d: Rejected decision with valid rejection_reason (10-500 chars) is accepted', () => {
    fc.assert(
      fc.property(
        validParametersArb,
        validRejectionReasonArb,
        (parameters, rejectionReason) => {
          const submission = {
            parameters,
            decision: 'rejected',
            rejection_reason: rejectionReason,
          };

          const result = qcSubmissionSchema.safeParse(submission);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12e: For any submission with decision 'passed',
   * rejection_reason is not required (null/undefined accepted).
   *
   * Validates: Requirements 3.3
   */
  it('Property 12e: Passed decision does not require rejection_reason (null/undefined accepted)', () => {
    fc.assert(
      fc.property(
        validParametersArb,
        fc.oneof(fc.constant(null), fc.constant(undefined)),
        (parameters, rejectionReason) => {
          const submission: Record<string, unknown> = {
            parameters,
            decision: 'passed',
          };

          if (rejectionReason !== undefined) {
            submission.rejection_reason = rejectionReason;
          }

          const result = qcSubmissionSchema.safeParse(submission);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
