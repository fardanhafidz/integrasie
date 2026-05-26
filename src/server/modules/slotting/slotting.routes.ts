/**
 * Slotting Routes
 *
 * Protected routes — requires authentication (auth middleware) and
 * role-based access control (RBAC middleware).
 *
 * Accessible by: Warehouse_Operator, Factory_Manager
 *
 * Route structure (mounted at /api/slotting):
 * - GET /:lotId/recommendations → getRecommendationsHandler
 * - POST /:lotId/assign → assignSlotHandler
 * - POST /:lotId/override → overrideSlotHandler
 *
 * Validates: Requirements 4.1, 4.5, 4.6
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { rbacMiddleware } from '../../middleware/rbac';
import {
  getRecommendationsHandler,
  assignSlotHandler,
  overrideSlotHandler,
} from './slotting.controller';

const slottingRouter = Router();

// GET /api/slotting/:lotId/recommendations — Get slot recommendations (Warehouse_Operator, Factory_Manager)
slottingRouter.get(
  '/:lotId/recommendations',
  authMiddleware,
  rbacMiddleware,
  getRecommendationsHandler
);

// POST /api/slotting/:lotId/assign — Confirm slot assignment (Warehouse_Operator, Factory_Manager)
slottingRouter.post(
  '/:lotId/assign',
  authMiddleware,
  rbacMiddleware,
  assignSlotHandler
);

// POST /api/slotting/:lotId/override — Override slot with justification (Warehouse_Operator, Factory_Manager)
slottingRouter.post(
  '/:lotId/override',
  authMiddleware,
  rbacMiddleware,
  overrideSlotHandler
);

export default slottingRouter;
