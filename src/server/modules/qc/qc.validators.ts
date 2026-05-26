import { z } from 'zod';

/**
 * Valid QC decision values.
 */
export const QC_DECISIONS = ['passed', 'rejected'] as const;

/**
 * Zod validation schema for QC submission.
 *
 * Validates: Requirements 3.3, 3.5, 3.7
 *
 * - parameters: must contain at least one key-value pair (values can be string or number)
 * - decision: must be either 'passed' or 'rejected'
 * - rejection_reason: required (10-500 chars) when decision is 'rejected', optional/null when 'passed'
 */
export const qcSubmissionSchema = z
  .object({
    parameters: z
      .record(z.string(), z.union([z.string(), z.number()]), {
        required_error: 'Quality parameters are required',
        invalid_type_error: 'Quality parameters must be an object with string or numeric values',
      })
      .refine((params) => Object.keys(params).length >= 1, {
        message: 'At least one quality parameter must be provided',
      }),

    decision: z.enum(QC_DECISIONS, {
      required_error: 'QC decision is required',
      invalid_type_error: 'QC decision must be either "passed" or "rejected"',
    }),

    rejection_reason: z
      .string()
      .min(10, { message: 'Rejection reason must be at least 10 characters' })
      .max(500, { message: 'Rejection reason must not exceed 500 characters' })
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'rejected') {
      if (!data.rejection_reason || data.rejection_reason === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Rejection reason is required when decision is "rejected"',
          path: ['rejection_reason'],
        });
      }
    }
  });

/**
 * TypeScript type inferred from the QC submission validation schema.
 */
export type QCSubmissionInput = z.infer<typeof qcSubmissionSchema>;
