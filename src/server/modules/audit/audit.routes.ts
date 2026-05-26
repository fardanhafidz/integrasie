/**
 * Audit Routes
 *
 * Protected routes — requires authentication (auth middleware) and
 * role-based access control (RBAC middleware).
 *
 * Accessible by: Factory_Manager only
 * Mount at /api/audit in the main Express app.
 *
 * Validates: Requirement 6.4
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { rbacMiddleware } from '../../middleware/rbac';
import { getAuditTrailHandler } from './audit.controller';

const router = Router();

// GET /api/audit — Query audit trail with filters (date range, user, action, lot number)
// Only Factory_Manager has access per permissions.ts
router.get('/', authMiddleware, rbacMiddleware, getAuditTrailHandler);

export default router;
