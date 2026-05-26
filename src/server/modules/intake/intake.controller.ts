/**
 * Intake Controller
 *
 * Handles HTTP request/response for supplier intake endpoints.
 * Delegates business logic to intake.service.
 *
 * Validates: Requirements 2.1, 2.4, 2.6
 *
 * Error responses:
 * - Validation error: 400 with field-level errors
 * - Locked intake modification: 403 { error: 'Forbidden', message: '...' }
 * - Not found: 404 { error: 'Not found', message: 'Intake not found' }
 * - Duplicate warning: 409 { error: 'Duplicate warning', message: '...', isDuplicate: true }
 */

import { Request, Response } from 'express';
import {
  createIntake,
  getIntakes,
  getIntakeById,
  updateIntake,
  IntakeError,
  ValidationError,
  DuplicateWarningError,
  DatabaseError,
} from './intake.service';
import { JwtPayload } from '../../shared/types';

/**
 * POST /api/intakes
 *
 * Creates a new supplier intake and auto-generates a lot number.
 * The service handles validation and duplicate checking internally.
 * If duplicate found and confirmDuplicate is not true, returns 409.
 *
 * Request body: SupplierIntakeInput + optional { confirmDuplicate: boolean }
 * Response: 201 { intake, lot }
 */
export async function createIntakeHandler(req: Request, res: Response): Promise<void> {
  const user = req.user as JwtPayload;
  const confirmDuplicate = req.body.confirmDuplicate === true;

  try {
    const result = await createIntake(req.body, user.userId, confirmDuplicate);
    res.status(201).json(result);
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: 'Validation error',
        message: 'One or more fields failed validation',
        errors: error.fieldErrors,
      });
      return;
    }

    if (error instanceof DuplicateWarningError) {
      res.status(409).json({
        error: 'Duplicate warning',
        message: error.message,
        isDuplicate: true,
      });
      return;
    }

    if (error instanceof DatabaseError) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
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
 * GET /api/intakes
 *
 * Retrieves a paginated list of supplier intakes.
 *
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 20, max 50)
 *
 * Response: 200 { data: [...], pagination: { page, limit, total, totalPages } }
 */
export async function getIntakesHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const result = await getIntakes(page, limit);

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
 * GET /api/intakes/:id
 *
 * Retrieves a single supplier intake by ID.
 *
 * Response: 200 { intake } or 404 { error: 'Not found', message: 'Intake not found' }
 */
export async function getIntakeByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const intake = await getIntakeById(id);

    if (!intake) {
      res.status(404).json({
        error: 'Not found',
        message: 'Intake not found',
      });
      return;
    }

    res.status(200).json(intake);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * PUT /api/intakes/:id
 * Attempts to replace a supplier intake record.
 * Returns 403 if the intake is locked (after lot generation).
 * Returns 404 if the intake does not exist.
 *
 * Validates: Requirements 2.4
 */
export async function updateIntakeHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const data = req.body;

  try {
    const result = await updateIntake(id, data);
    res.status(200).json(result);
  } catch (error: unknown) {
    if (error instanceof IntakeError) {
      if (error.statusCode === 404) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Intake not found',
        });
        return;
      }

      if (error.statusCode === 403) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Intake data is locked and cannot be modified after lot generation',
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/**
 * PATCH /api/intakes/:id
 * Attempts to partially update a supplier intake record.
 * Returns 403 if the intake is locked (after lot generation).
 * Returns 404 if the intake does not exist.
 *
 * Validates: Requirements 2.4
 */
export async function patchIntakeHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const data = req.body;

  try {
    const result = await updateIntake(id, data);
    res.status(200).json(result);
  } catch (error: unknown) {
    if (error instanceof IntakeError) {
      if (error.statusCode === 404) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Intake not found',
        });
        return;
      }

      if (error.statusCode === 403) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Intake data is locked and cannot be modified after lot generation',
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Internal server error',
    });
  }
}
