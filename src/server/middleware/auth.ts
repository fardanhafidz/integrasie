/**
 * JWT Authentication Middleware
 *
 * Extracts and verifies JWT access tokens from the Authorization header.
 * Attaches decoded user payload to req.user for downstream middleware (RBAC).
 * Checks session timeout (30 minutes inactivity) using the token's iat claim.
 *
 * Validates: Requirements 1.1, 1.9
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload } from '../shared/types';
import { checkSessionTimeout } from '../modules/auth/auth.service';

// Extend Express Request to include user property
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Express middleware that verifies JWT access tokens on protected routes.
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT signature and expiration using JWT_SECRET
 * 3. Decode payload and attach to req.user as JwtPayload
 * 4. Check session timeout (30 min inactivity) using iat claim as proxy for last activity
 *
 * Error responses:
 * - No token: 401 { error: 'Unauthorized', message: 'No token provided' }
 * - Invalid/expired: 401 { error: 'Unauthorized', message: 'Invalid or expired token' }
 * - Session timeout: 401 { error: 'Session expired', message: 'Session has timed out due to inactivity' }
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // 1. Extract Bearer token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided',
    });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided',
    });
    return;
  }

  try {
    // 2. Verify JWT using JWT_SECRET
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // 3. Check session timeout using iat claim as proxy for last activity
    if (decoded.iat) {
      const lastActivity = new Date(decoded.iat * 1000); // iat is in seconds
      if (checkSessionTimeout(lastActivity)) {
        res.status(401).json({
          error: 'Session expired',
          message: 'Session has timed out due to inactivity',
        });
        return;
      }
    }

    // 4. Attach decoded payload to req.user
    req.user = decoded;

    next();
  } catch (error: unknown) {
    // Handle JWT verification errors (expired, malformed, invalid signature)
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
    return;
  }
};
