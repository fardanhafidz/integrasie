import { z } from 'zod';

/**
 * Predefined valid material groups for supplier intake.
 * Each entry maps a display name to its corresponding code.
 */
export const MATERIAL_GROUPS = [
  { name: 'Raw Chemical', code: 'RC' },
  { name: 'Packaging Material', code: 'PM' },
  { name: 'Solvent', code: 'SV' },
  { name: 'Additive', code: 'AD' },
  { name: 'Resin', code: 'RS' },
  { name: 'Pigment', code: 'PG' },
] as const;

export const VALID_MATERIAL_GROUP_NAMES = MATERIAL_GROUPS.map((g) => g.name);
export const VALID_MATERIAL_GROUP_CODES = MATERIAL_GROUPS.map((g) => g.code);

/**
 * Zod validation schema for the Supplier Intake form.
 *
 * Validates: Requirements 2.1, 2.5
 */
export const supplierIntakeSchema = z.object({
  supplier_name: z
    .string({
      required_error: 'Supplier name is required',
    })
    .trim()
    .min(1, { message: 'Supplier name must not be empty' })
    .max(100, { message: 'Supplier name must not exceed 100 characters' })
    .refine((val) => val.trim().length > 0, {
      message: 'Supplier name must not be only whitespace',
    }),

  material_group: z
    .string({
      required_error: 'Material group is required',
    })
    .min(1, { message: 'Material group must be selected' })
    .refine((val) => VALID_MATERIAL_GROUP_NAMES.includes(val as (typeof VALID_MATERIAL_GROUP_NAMES)[number]), {
      message: `Material group must be one of: ${VALID_MATERIAL_GROUP_NAMES.join(', ')}`,
    }),

  material_group_code: z
    .string({
      required_error: 'Material group code is required',
    })
    .min(2, { message: 'Material group code must be at least 2 characters' })
    .max(10, { message: 'Material group code must not exceed 10 characters' })
    .regex(/^[A-Z0-9]+$/, {
      message: 'Material group code must contain only uppercase alphanumeric characters',
    }),

  quantity: z
    .number({
      required_error: 'Quantity is required',
      invalid_type_error: 'Quantity must be a numeric value',
    })
    .gt(0, { message: 'Quantity must be greater than zero' })
    .lte(99999, { message: 'Quantity must not exceed 99,999' }),

  unit: z
    .string({
      required_error: 'Unit is required',
    })
    .trim()
    .min(1, { message: 'Unit must not be empty' })
    .max(20, { message: 'Unit must not exceed 20 characters' }),

  delivery_date: z
    .string({
      required_error: 'Delivery date is required',
    })
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'Delivery date must be in YYYY-MM-DD format',
    })
    .refine(
      (val) => {
        const date = new Date(val + 'T00:00:00Z');
        return !isNaN(date.getTime());
      },
      { message: 'Delivery date must be a valid calendar date' }
    )
    .refine(
      (val) => {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const deliveryDate = new Date(val + 'T00:00:00Z');
        return deliveryDate <= today;
      },
      { message: 'Delivery date must not be a future date' }
    ),

  truck_reference: z
    .string({
      required_error: 'Truck reference is required',
    })
    .trim()
    .min(1, { message: 'Truck reference must not be empty' })
    .max(50, { message: 'Truck reference must not exceed 50 characters' })
    .regex(/^[a-zA-Z0-9]+$/, {
      message: 'Truck reference must contain only alphanumeric characters',
    }),
});

/**
 * TypeScript type inferred from the supplier intake validation schema.
 */
export type SupplierIntakeInput = z.infer<typeof supplierIntakeSchema>;
