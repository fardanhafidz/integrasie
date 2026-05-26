/**
 * PPIC Controller
 *
 * Handles HTTP request/response for PPIC (Production Planning and Inventory Control) endpoints.
 * Delegates business logic to ppic.service.
 *
 * Validates: Requirements 8.1, 8.3, 8.5
 *
 * Error responses:
 * - 400: Validation errors (missing/invalid fields)
 * - 404: Resource not found (schedule, lot, user)
 * - 409: Stock conflicts (insufficient unreserved quantity)
 */

import { Request, Response } from 'express';
import {
  getAvailableStock,
  createSchedule,
  getSchedules,
  createWorkOrder,
  PPICValidationError,
  PPICNotFoundError,
  PPICStockConflictError,
  ScheduleInput,
  WorkOrderInput,
} from './ppic.service';
import { JwtPayload } from '../../shared/types';

/**
 * GET /api/ppic/stock
 *
 * Returns available stock dashboard showing lots with status "passed" or "ready_to_store".
 * Includes material group, quantity, warehouse location, and lot number.
 *
 * Response: 200 { data: [...], total }
 *
 * Validates: Requirement 8.1
 */
export async function getStockHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await getAvailableStock();
    res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * POST /api/ppic/schedules
 *
 * Creates a new production schedule with stock validation.
 * Validates that all referenced lots have status "ready_to_store"
 * and that requested quantities do not exceed unreserved amounts.
 *
 * Request body: { title, scheduled_date, lots: [{ lot_id, quantity_required }] }
 * Response: 201 { schedule }
 *
 * Validates: Requirement 8.3
 */
export async function createScheduleHandler(req: Request, res: Response): Promise<void> {
  const user = req.user as JwtPayload;

  try {
    const input: ScheduleInput = {
      title: req.body.title,
      scheduled_date: req.body.scheduled_date,
      lots: req.body.lots,
    };

    const schedule = await createSchedule(input, user.userId);
    res.status(201).json(schedule);
  } catch (error: unknown) {
    if (error instanceof PPICValidationError) {
      res.status(400).json({
        error: 'Validation error',
        message: 'One or more fields failed validation',
        errors: error.fieldErrors,
      });
      return;
    }

    if (error instanceof PPICNotFoundError) {
      res.status(404).json({
        error: 'Not found',
        message: error.message,
      });
      return;
    }

    if (error instanceof PPICStockConflictError) {
      res.status(409).json({
        error: 'Stock conflict',
        message: error.message,
        conflicts: error.conflicts,
      });
      return;
    }

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * GET /api/ppic/schedules
 *
 * Returns a paginated list of production schedules.
 *
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 20, max 50)
 *
 * Response: 200 { data: [...], pagination: { page, limit, total, totalPages } }
 *
 * Validates: Requirement 8.3
 */
export async function getSchedulesHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const result = await getSchedules(page, limit);
    res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * POST /api/ppic/work-orders
 *
 * Creates a new work order for a production schedule.
 * Reserves lot quantities and notifies assigned production operators.
 *
 * Request body: { schedule_id, assigned_to, instructions }
 * Response: 201 { workOrder }
 *
 * Validates: Requirement 8.5
 */
export async function createWorkOrderHandler(req: Request, res: Response): Promise<void> {
  const user = req.user as JwtPayload;

  try {
    const input: WorkOrderInput = {
      schedule_id: req.body.schedule_id,
      assigned_to: req.body.assigned_to,
      instructions: req.body.instructions,
    };

    const workOrder = await createWorkOrder(input, user.userId);
    res.status(201).json(workOrder);
  } catch (error: unknown) {
    if (error instanceof PPICValidationError) {
      res.status(400).json({
        error: 'Validation error',
        message: 'One or more fields failed validation',
        errors: error.fieldErrors,
      });
      return;
    }

    if (error instanceof PPICNotFoundError) {
      res.status(404).json({
        error: 'Not found',
        message: error.message,
      });
      return;
    }

    if (error instanceof PPICStockConflictError) {
      res.status(409).json({
        error: 'Stock conflict',
        message: error.message,
        conflicts: error.conflicts,
      });
      return;
    }

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}
