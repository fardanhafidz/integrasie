/**
 * QC Controller
 *
 * Handles HTTP request/response for quality control endpoints.
 * Delegates business logic to qc.service.
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 *
 * Error responses:
 * - Validation error: 400 with field-level errors
 * - Lot not found: 404
 * - Invalid lot status: 409 (lot not in pending_qc state)
 */

import { Request, Response } from 'express';
import { getPendingQCQueue, submitQCResult, getQCHistory } from './qc.service';
import { qcSubmissionSchema } from './qc.validators';
import { JwtPayload } from '../../shared/types';

/**
 * GET /api/lots/pending-qc
 *
 * Returns all lots with status 'pending_qc' ordered by delivery date ascending.
 * Requirement 3.1: Display all lots with Lot_Status "Pending QC" in chronological queue
 *
 * Response: 200 { data: Lot[] }
 */
export async function getPendingQCHandler(req: Request, res: Response): Promise<void> {
  try {
    const lots = await getPendingQCQueue();
    res.status(200).json({ data: lots });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * POST /api/qc/:lotId/result
 *
 * Submits a QC result for a lot. Validates body with qcSubmissionSchema.
 * Requirement 3.3: Record QC decision with parameters
 *
 * Request body: { parameters: Record<string, string|number>, decision: 'passed'|'rejected', rejection_reason?: string }
 * Response: 201 { data: QCResult }
 *
 * Error responses:
 * - 400: Validation error with field-level errors
 * - 404: Lot not found
 * - 409: Lot not in pending_qc state
 */
export async function submitQCResultHandler(req: Request, res: Response): Promise<void> {
  const { lotId } = req.params;
  const user = req.user as JwtPayload;

  // Validate request body with Zod schema
  const validation = qcSubmissionSchema.safeParse(req.body);

  if (!validation.success) {
    const fieldErrors = validation.error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));

    res.status(400).json({
      error: 'Validation error',
      message: 'One or more fields failed validation',
      errors: fieldErrors,
    });
    return;
  }

  const { parameters, decision, rejection_reason } = validation.data;

  try {
    const result = await submitQCResult(
      lotId,
      parameters,
      decision,
      rejection_reason ?? null,
      user.userId
    );

    res.status(201).json({ data: result });
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Lot not found
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not found',
          message: `Lot with id '${lotId}' not found`,
        });
        return;
      }

      // Lot not in pending_qc state (conflict)
      if (error.message.includes('cannot be submitted for QC')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
        return;
      }
    }

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * GET /api/qc/:lotId/history
 *
 * Returns all QC results for a lot, ordered by tested_at descending.
 *
 * Response: 200 { data: QCResult[] }
 *
 * Error responses:
 * - 404: Lot not found
 */
export async function getQCHistoryHandler(req: Request, res: Response): Promise<void> {
  const { lotId } = req.params;

  try {
    const results = await getQCHistory(lotId);
    res.status(200).json({ data: results });
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Lot not found
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not found',
          message: `Lot with id '${lotId}' not found`,
        });
        return;
      }
    }

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}
