/**
 * Temperature Routes
 *
 * Protected routes — requires authentication (auth middleware) and
 * role-based access control (RBAC middleware).
 *
 * Accessible by: Warehouse_Operator, Factory_Manager
 * Mount at /api/temperature in the main Express app.
 *
 * Validates: Requirements 5.2, 5.6
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { rbacMiddleware } from '../../middleware/rbac';
import {
  getCurrentHandler,
  getHistoryHandler,
  getBreachesHandler,
} from './temperature.controller';

const router = Router();

// All temperature routes require authentication + RBAC
// Warehouse_Operator and Factory_Manager have GET access per permissions.ts

// GET /api/temperature/current — Get latest reading for each cold_chain zone (Requirement 5.2)
router.get('/current', authMiddleware, rbacMiddleware, getCurrentHandler);

// GET /api/temperature/history/:zoneId — Get paginated history for a zone (Requirement 5.2)
router.get('/history/:zoneId', authMiddleware, rbacMiddleware, getHistoryHandler);

// GET /api/temperature/breaches — Get recent breach readings (Requirement 5.6)
router.get('/breaches', authMiddleware, rbacMiddleware, getBreachesHandler);

export default router;
