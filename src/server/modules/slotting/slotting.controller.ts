/**
 * Slotting Controller
 *
 * Handles HTTP request/response for smart slotting endpoints.
 * Delegates business logic to slotting.service.
 *
 * Routes (mounted at /api/slotting, protected with authMiddleware + rbacMiddleware):
 * - GET /:lotId/recommendations → slot recommendations
 * - POST /:lotId/assign → confirm placement (stub, implemented in 6.6)
 * - POST /:lotId/override → override placement (stub, implemented in 6.7)
 *
 * Validates: Requirements 4.1, 4.5, 4.6
 *
 * Error responses:
 * - Lot not found: 404
 * - Lot not ready_to_store: 409
 * - No available slots: 200 with empty array + warning message
 */

import { Request, Response } from 'express';
import { recommendSlots, assignSlot, overrideSlot } from './slotting.service';

/**
 * GET /api/slotting/:lotId/recommendations
 *
 * Returns 1–5 valid slot recommendations for a lot.
 * Requirement 4.1: System recommends optimal rack coordinates
 *
 * Response: 200 { data: SlotRecommendation[], warning?: string }
 *
 * Error responses:
 * - 404: Lot not found
 * - 409: Lot not in ready_to_store status
 */
export async function getRecommendationsHandler(req: Request, res: Response): Promise<void> {
  const { lotId } = req.params;

  try {
    const slots = await recommendSlots(lotId);

    if (slots.length === 0) {
      res.status(200).json({
        data: [],
        warning: 'No available slots found for this lot. All eligible slots are currently occupied or reserved.',
      });
      return;
    }

    res.status(200).json({ data: slots });
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

      // Lot not in ready_to_store status (conflict)
      if (error.message.includes('not ready to store')) {
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
 * POST /api/slotting/:lotId/assign
 *
 * Confirms slot assignment for a lot.
 * Requirement 4.5: Warehouse_Operator confirms placement
 *
 * Request body: { slotId: string }
 * Response: 200 { data: RackSlot }
 *
 * Error responses:
 * - 400: Missing slotId in request body
 * - 404: Lot or slot not found
 * - 409: Lot not in ready_to_store status or slot not available
 */
export async function assignSlotHandler(req: Request, res: Response): Promise<void> {
  const { lotId } = req.params;
  const { slotId } = req.body;

  // Validate request body
  if (!slotId || typeof slotId !== 'string' || slotId.trim() === '') {
    res.status(400).json({
      error: 'Bad request',
      message: 'slotId is required in the request body',
    });
    return;
  }

  // Get user ID from authenticated request
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'User not authenticated',
    });
    return;
  }

  try {
    const updatedSlot = await assignSlot(lotId, slotId.trim(), userId);

    res.status(200).json({ data: updatedSlot });
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Lot not found or slot not found
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not found',
          message: error.message,
        });
        return;
      }

      // Lot not in ready_to_store status or slot not available (conflict)
      if (error.message.includes('not ready to store') || error.message.includes('not available')) {
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
 * POST /api/slotting/:lotId/override
 *
 * Overrides slot assignment with mandatory justification.
 * Requirement 4.6: Override with justification (>= 10 chars)
 * Requirement 4.7: Record override in audit trail, notify Factory_Manager
 *
 * Request body: { slotId: string, justification: string }
 * Response:
 * - 200: { data: RackSlot, message: string }
 * - 400: Missing slotId or justification < 10 chars
 * - 404: Lot or slot not found
 * - 409: Slot not available
 */
export async function overrideSlotHandler(req: Request, res: Response): Promise<void> {
  const { lotId } = req.params;
  const { slotId, justification } = req.body;

  // Validate required fields
  if (!slotId) {
    res.status(400).json({
      error: 'Bad request',
      message: 'slotId is required in request body',
    });
    return;
  }

  if (!justification || typeof justification !== 'string' || justification.trim().length < 10) {
    res.status(400).json({
      error: 'Bad request',
      message: 'justification is required and must be at least 10 characters',
    });
    return;
  }

  // Get userId from authenticated request (set by auth middleware)
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'User not authenticated',
    });
    return;
  }

  try {
    const updatedSlot = await overrideSlot(lotId, slotId, justification, userId);

    res.status(200).json({
      data: updatedSlot,
      message: 'Slot override recorded successfully. Factory_Manager has been notified.',
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Lot not found or slot not found
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not found',
          message: error.message,
        });
        return;
      }

      // Lot not in ready_to_store status or slot not available
      if (error.message.includes('not ready to store') || error.message.includes('not available')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
        return;
      }

      // Justification validation (shouldn't reach here due to pre-validation, but just in case)
      if (error.message.includes('Justification')) {
        res.status(400).json({
          error: 'Bad request',
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
