/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Checks the authenticated user's role against the route permission map.
 * Runs AFTER auth middleware which attaches user info to req.user.
 *
 * - If req.user is not set: returns 401 (unauthenticated)
 * - If user's role lacks permission for the route/method: returns 403
 * - If permitted: calls next()
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { Request, Response, NextFunction } from 'express';
import { hasPermission, HttpMethod } from '../shared/permissions';
import { JwtPayload } from '../shared/types';

/**
 * Express middleware that enforces role-based access control.
 * Must be used after auth middleware that sets req.user with JwtPayload.
 */
export const rbacMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Check if user is authenticated (req.user should be set by auth middleware)
  const user = (req as Request & { user?: JwtPayload }).user;

  if (!user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // Extract HTTP method and path from the request
  const method = req.method.toUpperCase() as HttpMethod;
  const path = req.path;

  // Check if the user's role has permission for this route and method
  if (hasPermission(user.role, method, path)) {
    next();
    return;
  }

  // Deny access if role does not have permission
  res.status(403).json({
    error: 'Access denied',
    message: 'You do not have the required role for the requested resource',
  });
};
