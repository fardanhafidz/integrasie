import { describe, it, expect } from 'vitest';
import {
  supplierIntakeSchema,
  MATERIAL_GROUPS,
  VALID_MATERIAL_GROUP_NAMES,
  VALID_MATERIAL_GROUP_CODES,
} from '@server/modules/intake/intake.validators';

describe('supplierIntakeSchema', () => {
  const validInput = {
    supplier_name: 'PT Kimia Farma',
    material_group: 'Raw Chemical',
    material_group_code: 'RC',
    quantity: 500,
    unit: 'kg',
    delivery_date: '2024-01-15',
    truck_reference: 'TRK001',
  };

  it('should accept valid input', () => {
    const result = supplierIntakeSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  describe('supplier_name', () => {
    it('should reject empty string', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, supplier_name: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must not be empty');
      }
    });

    it('should reject whitespace-only string', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, supplier_name: '   ' });
      expect(result.success).toBe(false);
    });

    it('should reject string exceeding 100 characters', () => {
      const result = supplierIntakeSchema.safeParse({
        ...validInput,
        supplier_name: 'A'.repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must not exceed 100 characters');
      }
    });

    it('should accept string at exactly 100 characters', () => {
      const result = supplierIntakeSchema.safeParse({
        ...validInput,
        supplier_name: 'A'.repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('material_group', () => {
    it('should reject empty string', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, material_group: '' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid material group', () => {
      const result = supplierIntakeSchema.safeParse({
        ...validInput,
        material_group: 'Invalid Group',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must be one of');
      }
    });

    it('should accept all valid material groups', () => {
      for (const group of VALID_MATERIAL_GROUP_NAMES) {
        const result = supplierIntakeSchema.safeParse({ ...validInput, material_group: group });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('material_group_code', () => {
    it('should reject empty string', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, material_group_code: '' });
      expect(result.success).toBe(false);
    });

    it('should reject single character (less than 2)', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, material_group_code: 'A' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2 characters');
      }
    });

    it('should reject string exceeding 10 characters', () => {
      const result = supplierIntakeSchema.safeParse({
        ...validInput,
        material_group_code: 'ABCDEFGHIJK',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must not exceed 10 characters');
      }
    });

    it('should reject lowercase characters', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, material_group_code: 'rc' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('uppercase alphanumeric');
      }
    });

    it('should reject special characters', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, material_group_code: 'R-C' });
      expect(result.success).toBe(false);
    });

    it('should accept valid uppercase alphanumeric codes', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, material_group_code: 'RC01' });
      expect(result.success).toBe(true);
    });
  });

  describe('quantity', () => {
    it('should reject zero', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, quantity: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('greater than zero');
      }
    });

    it('should reject negative numbers', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, quantity: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject values exceeding 99999', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, quantity: 100000 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must not exceed 99,999');
      }
    });

    it('should accept value at exactly 99999', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, quantity: 99999 });
      expect(result.success).toBe(true);
    });

    it('should accept decimal values within range', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, quantity: 0.5 });
      expect(result.success).toBe(true);
    });

    it('should reject non-numeric values', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, quantity: 'abc' });
      expect(result.success).toBe(false);
    });
  });

  describe('unit', () => {
    it('should reject empty string', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, unit: '' });
      expect(result.success).toBe(false);
    });

    it('should reject string exceeding 20 characters', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, unit: 'A'.repeat(21) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must not exceed 20 characters');
      }
    });

    it('should accept valid units', () => {
      for (const unit of ['kg', 'L', 'drums', 'pcs', 'tons']) {
        const result = supplierIntakeSchema.safeParse({ ...validInput, unit });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('delivery_date', () => {
    it('should reject invalid format', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, delivery_date: '15-01-2024' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('YYYY-MM-DD format');
      }
    });

    it('should reject invalid calendar date', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, delivery_date: '2024-13-01' });
      expect(result.success).toBe(false);
    });

    it('should reject future dates', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];
      const result = supplierIntakeSchema.safeParse({ ...validInput, delivery_date: futureDateStr });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must not be a future date');
      }
    });

    it('should accept today', () => {
      const today = new Date().toISOString().split('T')[0];
      const result = supplierIntakeSchema.safeParse({ ...validInput, delivery_date: today });
      expect(result.success).toBe(true);
    });

    it('should accept past dates', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, delivery_date: '2023-06-15' });
      expect(result.success).toBe(true);
    });
  });

  describe('truck_reference', () => {
    it('should reject empty string', () => {
      const result = supplierIntakeSchema.safeParse({ ...validInput, truck_reference: '' });
      expect(result.success).toBe(false);
    });

    it('should reject string exceeding 50 characters', () => {
      const result = supplierIntakeSchema.safeParse({
        ...validInput,
        truck_reference: 'A'.repeat(51),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must not exceed 50 characters');
      }
    });

    it('should reject non-alphanumeric characters', () => {
      const result = supplierIntakeSchema.safeParse({
        ...validInput,
        truck_reference: 'TRK-001',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('only alphanumeric');
      }
    });

    it('should accept valid alphanumeric references', () => {
      const result = supplierIntakeSchema.safeParse({
        ...validInput,
        truck_reference: 'TRK001ABC',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('MATERIAL_GROUPS constant', () => {
  it('should contain 6 predefined material groups', () => {
    expect(MATERIAL_GROUPS).toHaveLength(6);
  });

  it('should have matching names and codes', () => {
    const expected = [
      { name: 'Raw Chemical', code: 'RC' },
      { name: 'Packaging Material', code: 'PM' },
      { name: 'Solvent', code: 'SV' },
      { name: 'Additive', code: 'AD' },
      { name: 'Resin', code: 'RS' },
      { name: 'Pigment', code: 'PG' },
    ];
    expect(MATERIAL_GROUPS).toEqual(expected);
  });

  it('should export valid material group names array', () => {
    expect(VALID_MATERIAL_GROUP_NAMES).toEqual([
      'Raw Chemical',
      'Packaging Material',
      'Solvent',
      'Additive',
      'Resin',
      'Pigment',
    ]);
  });

  it('should export valid material group codes array', () => {
    expect(VALID_MATERIAL_GROUP_CODES).toEqual(['RC', 'PM', 'SV', 'AD', 'RS', 'PG']);
  });
});
