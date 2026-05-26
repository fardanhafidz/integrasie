/**
 * QC Routes
 *
 * Protected routes — requires authentication (auth middleware) and
 * role-based access control (RBAC middleware).
 *
 * Accessible by: QC_Staff, Factory_Manager
 *
 * Route structure:
 * - GET /pending-qc → getPendingQCHandler (mounted under /api/lots)
 * - POST /:lotId/result → submitQCResultHandler (mounted under /api/qc)
 * - GET /:lotId/history → getQCHistoryHandler (mounted under /api/qc)
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { rbacMiddleware } from '../../middleware/rbac';
import {
  getPendingQCHandler,
  submitQCResultHandler,
  getQCHistoryHandler,
} from './qc.controller';

/**
 * QC routes mounted at /api/qc
 * - POST /:lotId/result — Submit QC result (Requirement 3.3)
 * - GET /:lotId/history — Get QC history for a lot
 */
const qcRouter = Router();

// POST /api/qc/:lotId/result — Submit QC decision (QC_Staff, Factory_Manager)
qcRouter.post('/:lotId/result', authMiddleware, rbacMiddleware, submitQCResultHandler);

// GET /api/qc/:lotId/history — Get QC history for a lot (QC_Staff, Factory_Manager)
qcRouter.get('/:lotId/history', authMiddleware, rbacMiddleware, getQCHistoryHandler);

/**
 * Pending QC route mounted at /api/lots
 * - GET /pending-qc — Get pending QC queue (Requirement 3.1)
 */
const pendingQCRouter = Router();

// GET /api/lots/pending-qc — Get lots pending QC (QC_Staff, Factory_Manager)
pendingQCRouter.get('/pending-qc', authMiddleware, rbacMiddleware, getPendingQCHandler);

export { qcRouter, pendingQCRouter };
export default qcRouter;
