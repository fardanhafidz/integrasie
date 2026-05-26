/**
 * PPIC Service
 *
 * Business logic for PPIC (Production Planning and Inventory Control) module.
 * Handles stock visibility, production schedule creation, and work order management.
 *
 * Validates: Requirements 8.1, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */

import { prisma } from '../../config/database';
import { LotStatus, ScheduleStatus, WorkOrderStatus } from '@prisma/client';
import { io } from '@server/index';

// ─── Error Classes ───────────────────────────────────────────────────────────

export class PPICValidationError extends Error {
  public fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super('Validation failed');
    this.name = 'PPICValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class PPICNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PPICNotFoundError';
  }
}

export class PPICStockConflictError extends Error {
  public conflicts: Array<{ lotId: string; lotNumber: string; available: number; requested: number }>;

  constructor(
    message: string,
    conflicts: Array<{ lotId: string; lotNumber: string; available: number; requested: number }>
  ) {
    super(message);
    this.name = 'PPICStockConflictError';
    this.conflicts = conflicts;
  }
}

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface ScheduleInput {
  title: string;
  scheduled_date: string; // ISO date string YYYY-MM-DD
  lots: Array<{
    lot_id: string;
    quantity_required: number;
  }>;
}

export interface WorkOrderInput {
  schedule_id: string;
  assigned_to: string;
  instructions: string;
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Get available stock dashboard.
 * Returns lots with status "passed" or "ready_to_store" including
 * material group, quantity, warehouse location, and lot number.
 *
 * Validates: Requirement 8.1
 */
export async function getAvailableStock() {
  const lots = await prisma.lot.findMany({
    where: {
      status: {
        in: [LotStatus.passed, LotStatus.ready_to_store],
      },
    },
    include: {
      supplier_intake: {
        select: {
          material_group: true,
          material_group_code: true,
          quantity: true,
          unit: true,
        },
      },
      rack_slots: {
        select: {
          coordinate: true,
          zone: {
            select: {
              name: true,
              zone_type: true,
            },
          },
        },
      },
      drums: {
        select: {
          id: true,
          drum_number: true,
          weight_kg: true,
          rack_slot: {
            select: {
              coordinate: true,
            },
          },
        },
      },
    },
    orderBy: {
      updated_at: 'desc',
    },
  });

  return {
    data: lots,
    total: lots.length,
  };
}

/**
 * Create a production schedule with stock validation.
 * Validates that all referenced lots have status "ready_to_store"
 * and that requested quantities do not exceed unreserved amounts.
 *
 * Validates: Requirements 8.3, 8.4, 8.6, 8.8
 */
export async function createSchedule(input: ScheduleInput, userId: string) {
  // Validate required fields
  const fieldErrors: Record<string, string> = {};

  if (!input.title || input.title.trim().length === 0) {
    fieldErrors.title = 'Title is required';
  }

  if (!input.scheduled_date) {
    fieldErrors.scheduled_date = 'Scheduled date is required';
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(input.scheduled_date)) {
      fieldErrors.scheduled_date = 'Scheduled date must be in YYYY-MM-DD format';
    }
  }

  if (!input.lots || !Array.isArray(input.lots) || input.lots.length === 0) {
    fieldErrors.lots = 'At least one lot with quantity is required';
  } else {
    for (let i = 0; i < input.lots.length; i++) {
      const lotEntry = input.lots[i];
      if (!lotEntry.lot_id) {
        fieldErrors[`lots[${i}].lot_id`] = 'Lot ID is required';
      }
      if (!lotEntry.quantity_required || lotEntry.quantity_required <= 0) {
        fieldErrors[`lots[${i}].quantity_required`] = 'Quantity must be greater than zero';
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new PPICValidationError(fieldErrors);
  }

  // Validate lot statuses - all must be "ready_to_store"
  const lotIds = input.lots.map((l) => l.lot_id);
  const lots = await prisma.lot.findMany({
    where: { id: { in: lotIds } },
    include: {
      supplier_intake: {
        select: { quantity: true },
      },
      production_schedule_lots: {
        select: { quantity_required: true },
      },
    },
  });

  // Check all lots exist
  const foundLotIds = lots.map((l) => l.id);
  const missingLots = lotIds.filter((id) => !foundLotIds.includes(id));
  if (missingLots.length > 0) {
    throw new PPICNotFoundError(
      `Lots not found: ${missingLots.join(', ')}`
    );
  }

  // Check all lots have status "ready_to_store"
  const invalidStatusLots = lots.filter((l) => l.status !== LotStatus.ready_to_store);
  if (invalidStatusLots.length > 0) {
    const details = invalidStatusLots.map((l) => ({
      lotId: l.id,
      lotNumber: l.lot_number,
      currentStatus: l.status,
    }));
    throw new PPICValidationError({
      lots: `The following lots do not have status "ready_to_store": ${JSON.stringify(details)}`,
    });
  }

  // Check unreserved quantities
  const conflicts: Array<{ lotId: string; lotNumber: string; available: number; requested: number }> = [];

  for (const lotEntry of input.lots) {
    const lot = lots.find((l) => l.id === lotEntry.lot_id)!;
    const totalQuantity = lot.supplier_intake
      ? Number(lot.supplier_intake.quantity)
      : 0;

    // Calculate already reserved quantity from existing schedules
    const reservedQuantity = lot.production_schedule_lots.reduce(
      (sum, psl) => sum + Number(psl.quantity_required),
      0
    );

    const availableQuantity = totalQuantity - reservedQuantity;

    if (lotEntry.quantity_required > availableQuantity) {
      conflicts.push({
        lotId: lot.id,
        lotNumber: lot.lot_number,
        available: availableQuantity,
        requested: lotEntry.quantity_required,
      });
    }
  }

  if (conflicts.length > 0) {
    throw new PPICStockConflictError(
      'Insufficient unreserved stock for one or more lots',
      conflicts
    );
  }

  // Create the production schedule with lot associations
  const schedule = await prisma.productionSchedule.create({
    data: {
      title: input.title.trim(),
      scheduled_date: new Date(input.scheduled_date),
      status: ScheduleStatus.draft,
      created_by: userId,
      lots: {
        create: input.lots.map((l) => ({
          lot_id: l.lot_id,
          quantity_required: l.quantity_required,
        })),
      },
    },
    include: {
      lots: {
        include: {
          lot: {
            select: {
              id: true,
              lot_number: true,
              material_group_code: true,
              status: true,
            },
          },
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

  return schedule;
}

/**
 * Get production schedules with pagination.
 *
 * Validates: Requirement 8.3
 */
export async function getSchedules(page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;
  const safeLimit = Math.min(limit, 50);

  const [schedules, total] = await Promise.all([
    prisma.productionSchedule.findMany({
      skip,
      take: safeLimit,
      orderBy: { created_at: 'desc' },
      include: {
        lots: {
          include: {
            lot: {
              select: {
                id: true,
                lot_number: true,
                material_group_code: true,
                status: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        work_orders: {
          select: {
            id: true,
            status: true,
            assigned_to: true,
          },
        },
      },
    }),
    prisma.productionSchedule.count(),
  ]);

  return {
    data: schedules,
    pagination: {
      page,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * Create a work order for a production schedule.
 *
 * Validates: Requirements 8.5, 8.7
 */
export async function createWorkOrder(input: WorkOrderInput, userId: string) {
  // Validate required fields
  const fieldErrors: Record<string, string> = {};

  if (!input.schedule_id) {
    fieldErrors.schedule_id = 'Schedule ID is required';
  }

  if (!input.assigned_to) {
    fieldErrors.assigned_to = 'Assigned user ID is required';
  }

  if (!input.instructions || input.instructions.trim().length === 0) {
    fieldErrors.instructions = 'Instructions are required';
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new PPICValidationError(fieldErrors);
  }

  // Verify schedule exists
  const schedule = await prisma.productionSchedule.findUnique({
    where: { id: input.schedule_id },
    include: {
      lots: {
        include: {
          lot: true,
        },
      },
    },
  });

  if (!schedule) {
    throw new PPICNotFoundError('Production schedule not found');
  }

  // Verify assigned user exists
  const assignee = await prisma.user.findUnique({
    where: { id: input.assigned_to },
  });

  if (!assignee) {
    throw new PPICNotFoundError('Assigned user not found');
  }

  // Create work order
  const workOrder = await prisma.workOrder.create({
    data: {
      schedule_id: input.schedule_id,
      assigned_to: input.assigned_to,
      instructions: input.instructions.trim(),
      status: WorkOrderStatus.pending,
    },
    include: {
      schedule: {
        include: {
          lots: {
            include: {
              lot: {
                select: {
                  id: true,
                  lot_number: true,
                  material_group_code: true,
                },
              },
            },
          },
        },
      },
      assignee: {
        select: {
          id: true,
          full_name: true,
          email: true,
        },
      },
    },
  });

  // Emit Socket.IO notification for work order creation
  // Requirement 8.5, 8.7: Notify assigned production operators
  io.emit('workorder:created', {
    workOrderId: workOrder.id,
    scheduleId: workOrder.schedule_id,
    assignedTo: workOrder.assigned_to,
    instructions: workOrder.instructions,
    createdAt: workOrder.created_at.toISOString(),
  });

  return workOrder;
}
