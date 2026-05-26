import { prisma } from '@server/config/database';
import type { AuditTrail, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditParams {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: object | null;
  newValue: object;
}

export interface AuditFilters {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  action?: string;
  lotNumber?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Creates an append-only audit record in the audit_trails table.
 * Sets timestamp to current UTC time.
 */
export async function recordAudit(params: AuditParams): Promise<AuditTrail> {
  const { userId, action, entityType, entityId, oldValue, newValue } = params;

  const record = await prisma.auditTrail.create({
    data: {
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_value: oldValue as Prisma.InputJsonValue ?? Prisma.JsonNull,
      new_value: newValue as Prisma.InputJsonValue,
      timestamp: new Date(),
    },
  });

  return record;
}

/**
 * Wraps an operation in a transaction that includes audit record creation.
 * If audit record creation fails, the entire transaction is rolled back (Req 6.6).
 * Returns the operation result.
 */
export async function ensureRecorded<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  auditParams: AuditParams
): Promise<T> {
  const result = await prisma.$transaction(async (tx) => {
    // Execute the main operation first
    const operationResult = await operation(tx);

    // Create the audit record within the same transaction
    await tx.auditTrail.create({
      data: {
        user_id: auditParams.userId,
        action: auditParams.action,
        entity_type: auditParams.entityType,
        entity_id: auditParams.entityId,
        old_value: auditParams.oldValue as Prisma.InputJsonValue ?? Prisma.JsonNull,
        new_value: auditParams.newValue as Prisma.InputJsonValue,
        timestamp: new Date(),
      },
    });

    return operationResult;
  });

  return result;
}

/**
 * Query audit trail with filters, paginated (50 per page max), reverse chronological order.
 */
export async function queryAuditTrail(
  filters: AuditFilters
): Promise<PaginatedResult<AuditTrail>> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(50, Math.max(1, filters.limit ?? 50));
  const skip = (page - 1) * limit;

  // Build where clause from filters
  const where: Prisma.AuditTrailWhereInput = {};

  if (filters.dateFrom) {
    where.timestamp = {
      ...(where.timestamp as Prisma.DateTimeFilter ?? {}),
      gte: new Date(filters.dateFrom),
    };
  }

  if (filters.dateTo) {
    where.timestamp = {
      ...(where.timestamp as Prisma.DateTimeFilter ?? {}),
      lte: new Date(filters.dateTo),
    };
  }

  if (filters.userId) {
    where.user_id = filters.userId;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.lotNumber) {
    // Search for lot number in entity_id or within old_value/new_value JSON
    where.OR = [
      { entity_id: filters.lotNumber },
      {
        new_value: {
          path: ['lot_number'],
          equals: filters.lotNumber,
        },
      },
      {
        old_value: {
          path: ['lot_number'],
          equals: filters.lotNumber,
        },
      },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.auditTrail.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditTrail.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
