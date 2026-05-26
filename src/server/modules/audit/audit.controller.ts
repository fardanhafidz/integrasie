/**
 * Audit Controller
 *
 * Handles HTTP request/response for audit trail endpoints.
 * Delegates business logic to audit.service.
 *
 * Validates: Requirement 6.4
 */

import { Request, Response } from 'express';
import { queryAuditTrail, AuditFilters } from './audit.service';

/**
 * GET /api/audit
 *
 * Retrieves a paginated, reverse-chronological list of audit trail records.
 * Supports filtering by date range, user, action type, and lot number.
 * Maximum 50 records per page (enforced by service layer).
 *
 * Query params:
 * - dateFrom: ISO date string (inclusive start)
 * - dateTo: ISO date string (inclusive end)
 * - userId: UUID of the user who performed the action
 * - action: action type string (e.g., 'CREATE_INTAKE', 'QC_DECISION')
 * - lotNumber: lot number to search for in entity_id or JSON values
 * - page: number (default 1)
 * - limit: number (default 50, max 50)
 *
 * Response: 200 { data: [...], total, page, limit, totalPages }
 */
export async function getAuditTrailHandler(req: Request, res: Response): Promise<void> {
  try {
    const filters: AuditFilters = {
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      userId: req.query.userId as string | undefined,
      action: req.query.action as string | undefined,
      lotNumber: req.query.lotNumber as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await queryAuditTrail(filters);

    res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}
