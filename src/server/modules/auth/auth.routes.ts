import { Router } from 'express';
import { loginHandler, refreshHandler, logoutHandler } from './auth.controller';

/**
 * Auth Routes
 *
 * Public routes — no authentication middleware required.
 * Mount at /api/auth in the main Express app.
 *
 * Validates: Requirements 1.1, 1.8
 */
const router = Router();

// POST /api/auth/login — Authenticate user, return JWT tokens
router.post('/login', loginHandler);

// POST /api/auth/refresh — Refresh access token using refresh token
router.post('/refresh', refreshHandler);

// POST /api/auth/logout — Invalidate refresh token
router.post('/logout', logoutHandler);

export default router;
