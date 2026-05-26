import { prisma } from '../../config/database';
import { generateLotNumber } from './lotGenerator';
import { supplierIntakeSchema, SupplierIntakeInput } from './intake.validators';
import { ZodError } from 'zod';

/**
 * Intake Service
 *
 * Handles business logic for supplier intake operations including
 * validation, creation, retrieval, pagination, duplicate checking,
 * and immutability enforcement.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 2.7
 */

/**
 * Custom error class for intake-related errors with HTTP status codes.
 */
export class IntakeError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'IntakeError';
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/**
 * Custom error class for validation errors with field-level details.
 * Thrown when Zod schema validation fails.
 */
export class ValidationError extends Error {
  statusCode = 400;
  isOperational = true;
  fieldErrors: Record<string, string[]>;

  constructor(fieldErrors: Record<string, string[]>) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Custom error class for duplicate truck reference warnings.
 * Per Req 2.7, this is a warning (not blocking) — requires explicit confirmation.
 */
export class DuplicateWarningError extends Error {
  statusCode = 409;
  isOperational = true;
  isDuplicateWarning = true;

  constructor(truckReference: string, deliveryDate: string) {
    super(
      `Truck reference "${truckReference}" already exists for delivery date ${deliveryDate}. Explicit confirmation required to proceed.`
    );
    this.name = 'DuplicateWarningError';
  }
}

/**
 * Custom error class for database/internal errors.
 */
export class DatabaseError extends Error {
  statusCode = 500;
  isOperational = false;

  constructor(message = 'An internal database error occurred') {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Checks if a truck reference already exists for the same calendar day.
 *
 * Validates: Requirements 2.7
 *
 * @param truckReference - The truck reference to check
 * @param deliveryDate - The delivery date (YYYY-MM-DD string)
 * @returns true if a duplicate exists
 */
export async function checkDuplicate(
  truckReference: string,
  deliveryDate: string
): Promise<boolean> {
  const date = new Date(deliveryDate + 'T00:00:00Z');
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const existing = await prisma.supplierIntake.findFirst({
    where: {
      truck_reference: truckReference,
      delivery_date: {
        gte: date,
        lt: nextDay,
      },
    },
  });

  return existing !== null;
}

/**
 * Creates a new supplier intake record with auto-generated lot number.
 *
 * Flow:
 * 1. Validate input with Zod schema (Req 2.1)
 * 2. Check for duplicate truck reference on same delivery date (Req 2.7)
 * 3. Wrap in Prisma transaction:
 *    a. Create supplier_intake record with is_locked = true (Req 2.4)
 *    b. Generate lot number using lotGenerator (Req 2.2)
 *    c. Create lot record with status = 'pending_qc' (Req 2.3)
 * 4. Return { intake, lot } with generated lot number
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.7
 *
 * @param data - The supplier intake input data
 * @param userId - The ID of the user creating the intake
 * @param confirmDuplicate - If true, skip duplicate warning (user confirmed)
 * @returns The created intake and lot records
 */
export async function createIntake(
  data: SupplierIntakeInput,
  userId: string,
  confirmDuplicate = false
): Promise<{ intake: any; lot: any }> {
  // Step 1: Validate input with Zod schema (Req 2.1)
  let validatedData: SupplierIntakeInput;
  try {
    validatedData = supplierIntakeSchema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const field = issue.path.join('.');
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(issue.message);
      }
      throw new ValidationError(fieldErrors);
    }
    throw error;
  }

  // Step 2: Check for duplicate truck reference on same delivery date (Req 2.7)
  if (!confirmDuplicate) {
    const isDuplicate = await checkDuplicate(
      validatedData.truck_reference,
      validatedData.delivery_date
    );
    if (isDuplicate) {
      throw new DuplicateWarningError(
        validatedData.truck_reference,
        validatedData.delivery_date
      );
    }
  }

  // Step 3: Wrap in Prisma transaction
  try {
    const deliveryDate = new Date(validatedData.delivery_date + 'T00:00:00Z');

    // Generate lot number (Req 2.2)
    const lotNumber = await generateLotNumber(
      validatedData.material_group_code,
      deliveryDate
    );

    const result = await prisma.$transaction(async (tx) => {
      // 3a. Create supplier_intake record (is_locked = true per Req 2.4)
      const intake = await tx.supplierIntake.create({
        data: {
          supplier_name: validatedData.supplier_name,
          material_group: validatedData.material_group,
          material_group_code: validatedData.material_group_code,
          quantity: validatedData.quantity,
          unit: validatedData.unit,
          delivery_date: deliveryDate,
          truck_reference: validatedData.truck_reference,
          is_locked: true,
          created_by: userId,
        },
      });

      // 3c. Create lot record with status = 'pending_qc' (Req 2.3)
      const lot = await tx.lot.create({
        data: {
          lot_number: lotNumber,
          supplier_intake_id: intake.id,
          status: 'pending_qc',
          material_group_code: validatedData.material_group_code,
          is_temperature_sensitive: false,
          is_hazardous: false,
        },
      });

      return { intake, lot };
    });

    return result;
  } catch (error) {
    // Re-throw our custom errors
    if (
      error instanceof ValidationError ||
      error instanceof DuplicateWarningError
    ) {
      throw error;
    }
    throw new DatabaseError('Failed to create intake record');
  }
}

/**
 * Retrieves paginated list of supplier intakes.
 *
 * @param page - Page number (1-based, defaults to 1)
 * @param limit - Number of items per page (defaults to 20, max 50)
 * @returns Paginated intakes with associated lots
 */
export async function getIntakes(
  page: number = 1,
  limit: number = 20
) {
  // Clamp values
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(50, Math.max(1, limit));
  const skip = (safePage - 1) * safeLimit;

  const [data, total] = await Promise.all([
    prisma.supplierIntake.findMany({
      skip,
      take: safeLimit,
      orderBy: { created_at: 'desc' },
      include: {
        lots: {
          select: {
            id: true,
            lot_number: true,
            status: true,
          },
        },
      },
    }),
    prisma.supplierIntake.count(),
  ]);

  return {
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Retrieves a supplier intake record by its ID, including related lots and creator.
 *
 * @param id - The UUID of the supplier intake
 * @returns The supplier intake record or null if not found
 */
export async function getIntakeById(id: string) {
  return prisma.supplierIntake.findUnique({
    where: { id },
    include: {
      lots: {
        select: {
          id: true,
          lot_number: true,
          status: true,
          material_group_code: true,
          is_temperature_sensitive: true,
          is_hazardous: true,
          hazard_class: true,
          created_at: true,
          updated_at: true,
        },
      },
      creator: {
        select: {
          id: true,
          full_name: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Attempts to update a supplier intake record.
 * Enforces immutability: locked intakes cannot be modified by any user.
 * There is NO override mechanism — even Factory_Manager cannot modify locked intakes.
 *
 * Validates: Requirements 2.4
 *
 * @param id - The UUID of the supplier intake to update
 * @param _data - The fields to update (unused since locked intakes reject all updates)
 * @throws IntakeError with 404 if intake not found
 * @throws IntakeError with 403 if intake is locked
 */
export async function updateIntake(
  id: string,
  _data: Record<string, unknown>
): Promise<never> {
  const intake = await prisma.supplierIntake.findUnique({
    where: { id },
  });

  if (!intake) {
    throw new IntakeError('Intake not found', 404);
  }

  if (intake.is_locked) {
    throw new IntakeError(
      'Intake data is locked and cannot be modified after lot generation',
      403
    );
  }

  // If somehow an intake is not locked (shouldn't happen in normal flow since
  // intakes are created with is_locked=true), allow the update
  const updated = await prisma.supplierIntake.update({
    where: { id },
    data: _data as any,
  });

  return updated as never;
}
