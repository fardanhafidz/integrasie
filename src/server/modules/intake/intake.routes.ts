/**
 * Intake Routes
 *
 * Protected routes — requires authentication (auth middleware) and
 * role-based access control (RBAC middleware).
 *
 * Accessible by: Warehouse_Operator, Factory_Manager
 * Mount at /api/intakes in the main Express app.
 *
 * Validates: Requirements 2.1, 2.4, 2.6
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { rbacMiddleware } from '../../middleware/rbac';
import {
  createIntakeHandler,
  getIntakesHandler,
  getIntakeByIdHandler,
  updateIntakeHandler,
  patchIntakeHandler,
} from './intake.controller';

const router = Router();

// All intake routes require authentication + RBAC
// RBAC middleware checks permissions based on the user's role and the route/method
// Warehouse_Operator and Factory_Manager have access per permissions.ts

// POST /api/intakes — Create supplier intake + auto-generate lot (Requirement 2.1)
router.post('/', authMiddleware, rbacMiddleware, createIntakeHandler);

// GET /api/intakes — List intakes with pagination
router.get('/', authMiddleware, rbacMiddleware, getIntakesHandler);

// GET /api/intakes/:id — Get intake details by ID
router.get('/:id', authMiddleware, rbacMiddleware, getIntakeByIdHandler);

// PUT /api/intakes/:id — Attempt full update (blocked if locked, Requirement 2.4)
router.put('/:id', authMiddleware, rbacMiddleware, updateIntakeHandler);

// PATCH /api/intakes/:id — Attempt partial update (blocked if locked, Requirement 2.4)
router.patch('/:id', authMiddleware, rbacMiddleware, patchIntakeHandler);

export default router;
