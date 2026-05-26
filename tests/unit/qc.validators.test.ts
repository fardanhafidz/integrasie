import { describe, it, expect } from 'vitest';
import { qcSubmissionSchema, QC_DECISIONS } from '@server/modules/qc/qc.validators';

describe('qcSubmissionSchema', () => {
  const validPassedInput = {
    parameters: { viscosity: 12.5, color: 'clear' },
    decision: 'passed' as const,
    rejection_reason: null,
  };

  const validRejectedInput = {
    parameters: { viscosity: 12.5, color: 'cloudy' },
    decision: 'rejected' as const,
    rejection_reason: 'Sample failed viscosity test - measured value exceeds acceptable range',
  };

  it('should accept valid passed submission', () => {
    const result = qcSubmissionSchema.safeParse(validPassedInput);
    expect(result.success).toBe(true);
  });

  it('should accept valid rejected submission with reason', () => {
    const result = qcSubmissionSchema.safeParse(validRejectedInput);
    expect(result.success).toBe(true);
  });

  it('should accept passed submission without rejection_reason field', () => {
    const result = qcSubmissionSchema.safeParse({
      parameters: { pH: 7.2 },
      decision: 'passed',
    });
    expect(result.success).toBe(true);
  });

  describe('parameters', () => {
    it('should reject empty parameters object', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        parameters: {},
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('At least one quality parameter');
      }
    });

    it('should reject missing parameters', () => {
      const result = qcSubmissionSchema.safeParse({
        decision: 'passed',
        rejection_reason: null,
      });
      expect(result.success).toBe(false);
    });

    it('should accept parameters with string values', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        parameters: { color: 'clear', odor: 'none' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept parameters with numeric values', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        parameters: { viscosity: 12.5, pH: 7 },
      });
      expect(result.success).toBe(true);
    });

    it('should accept parameters with mixed string and numeric values', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        parameters: { viscosity: 12.5, color: 'clear', density: 1.02 },
      });
      expect(result.success).toBe(true);
    });

    it('should accept a single parameter entry', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        parameters: { pH: 7.0 },
      });
      expect(result.success).toBe(true);
    });

    it('should reject parameters with non-string/number values', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        parameters: { nested: { value: 1 } },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('decision', () => {
    it('should reject missing decision', () => {
      const result = qcSubmissionSchema.safeParse({
        parameters: { pH: 7.0 },
        rejection_reason: null,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid decision value', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        decision: 'pending',
      });
      expect(result.success).toBe(false);
    });

    it('should accept "passed" decision', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        decision: 'passed',
      });
      expect(result.success).toBe(true);
    });

    it('should accept "rejected" decision with valid reason', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validRejectedInput,
        decision: 'rejected',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-string decision', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        decision: 123,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('rejection_reason conditional requirement', () => {
    it('should require rejection_reason when decision is "rejected"', () => {
      const result = qcSubmissionSchema.safeParse({
        parameters: { viscosity: 12.5 },
        decision: 'rejected',
        rejection_reason: null,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const reasonIssue = result.error.issues.find((i) => i.path.includes('rejection_reason'));
        expect(reasonIssue).toBeDefined();
        expect(reasonIssue!.message).toContain('required when decision is "rejected"');
      }
    });

    it('should require rejection_reason when decision is "rejected" and field is omitted', () => {
      const result = qcSubmissionSchema.safeParse({
        parameters: { viscosity: 12.5 },
        decision: 'rejected',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const reasonIssue = result.error.issues.find((i) => i.path.includes('rejection_reason'));
        expect(reasonIssue).toBeDefined();
      }
    });

    it('should reject rejection_reason shorter than 10 characters when rejected', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validRejectedInput,
        rejection_reason: 'Too short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 10 characters');
      }
    });

    it('should reject rejection_reason exceeding 500 characters when rejected', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validRejectedInput,
        rejection_reason: 'A'.repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must not exceed 500 characters');
      }
    });

    it('should accept rejection_reason at exactly 10 characters', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validRejectedInput,
        rejection_reason: 'A'.repeat(10),
      });
      expect(result.success).toBe(true);
    });

    it('should accept rejection_reason at exactly 500 characters', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validRejectedInput,
        rejection_reason: 'A'.repeat(500),
      });
      expect(result.success).toBe(true);
    });

    it('should allow null rejection_reason when decision is "passed"', () => {
      const result = qcSubmissionSchema.safeParse({
        ...validPassedInput,
        rejection_reason: null,
      });
      expect(result.success).toBe(true);
    });

    it('should allow omitted rejection_reason when decision is "passed"', () => {
      const result = qcSubmissionSchema.safeParse({
        parameters: { pH: 7.0 },
        decision: 'passed',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('QC_DECISIONS constant', () => {
  it('should contain exactly two valid decisions', () => {
    expect(QC_DECISIONS).toHaveLength(2);
  });

  it('should contain "passed" and "rejected"', () => {
    expect(QC_DECISIONS).toContain('passed');
    expect(QC_DECISIONS).toContain('rejected');
  });
});
