/**
 * Notification Routes
 *
 * Protected routes — requires authentication (auth middleware) and
 * role-based access control (RBAC middleware).
 *
 * Accessible by: Factory_Manager only
 * Mount at /api/notifications in the main Express app.
 *
 * Validates: Requirements 7.5, 7.6
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { rbacMiddleware } from '../../middleware/rbac';
import { getConfigHandler, updateConfigHandler } from './notification.controller';

const router = Router();

// GET /api/notifications/config — Get notification configs grouped by alert category
// Only Factory_Manager has access per permissions.ts
router.get('/config', authMiddleware, rbacMiddleware, getConfigHandler);

// PUT /api/notifications/config — Update notification config for a category
// Only Factory_Manager has access per permissions.ts
router.put('/config', authMiddleware, rbacMiddleware, updateConfigHandler);

export default router;
