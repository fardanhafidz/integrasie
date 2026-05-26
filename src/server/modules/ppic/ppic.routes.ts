/**
 * PPIC Routes
 *
 * Protected routes — requires authentication (auth middleware) and
 * role-based access control (RBAC middleware).
 *
 * Accessible by: PPIC_Team, Factory_Manager
 * Mount at /api/ppic in the main Express app.
 *
 * Routes:
 * - GET  /stock        → getStockHandler (available stock dashboard)
 * - POST /schedules    → createScheduleHandler (create production schedule)
 * - GET  /schedules    → getSchedulesHandler (list schedules with pagination)
 * - POST /work-orders  → createWorkOrderHandler (create work order)
 *
 * Validates: Requirements 8.1, 8.3, 8.5
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { rbacMiddleware } from '../../middleware/rbac';
import {
  getStockHandler,
  createScheduleHandler,
  getSchedulesHandler,
  createWorkOrderHandler,
} from './ppic.controller';

const router = Router();

// GET /api/ppic/stock — Get available stock dashboard (PPIC_Team, Factory_Manager)
router.get('/stock', authMiddleware, rbacMiddleware, getStockHandler);

// POST /api/ppic/schedules — Create production schedule (PPIC_Team, Factory_Manager)
router.post('/schedules', authMiddleware, rbacMiddleware, createScheduleHandler);

// GET /api/ppic/schedules — List production schedules with pagination (PPIC_Team, Factory_Manager)
router.get('/schedules', authMiddleware, rbacMiddleware, getSchedulesHandler);

// POST /api/ppic/work-orders — Create work order (PPIC_Team, Factory_Manager)
router.post('/work-orders', authMiddleware, rbacMiddleware, createWorkOrderHandler);

export default router;
