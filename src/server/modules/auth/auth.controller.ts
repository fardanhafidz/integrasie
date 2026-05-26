import { Request, Response } from 'express';
import { login, refreshToken, logout, AuthError } from './auth.service';

/**
 * Auth Controller
 *
 * Handles HTTP request/response for authentication endpoints.
 * Delegates business logic to auth.service.
 *
 * Error responses per Requirements 1.1, 1.8:
 * - Invalid credentials: 401 { error: 'Authentication failed' } (no field-specific hints)
 * - Account locked: 423 { error: 'Account locked', message: '...' }
 * - Invalid refresh token: 401 { error: 'Invalid refresh token' }
 * - Missing fields: 400 { error: 'Validation error', message: '...' }
 */

/**
 * POST /api/auth/login
 * Authenticates user with email and password, returns JWT tokens and user info.
 */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  // Validate required fields
  if (!email || !password) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Email and password are required',
    });
    return;
  }

  try {
    const result = await login(email, password);
    res.status(200).json(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      // Account locked (423)
      if (error.statusCode === 423) {
        res.status(423).json({
          error: 'Account locked',
          message: 'Too many failed attempts. Try again later.',
        });
        return;
      }

      // Inactive account (403) — return generic auth failure per Req 1.8
      if (error.statusCode === 403) {
        res.status(401).json({
          error: 'Authentication failed',
        });
        return;
      }

      // Invalid credentials (401) — generic message per Req 1.8 (no field-specific hints)
      if (error.statusCode === 401) {
        res.status(401).json({
          error: 'Authentication failed',
        });
        return;
      }
    }

    // Unexpected error
    res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/**
 * POST /api/auth/refresh
 * Issues a new access token from a valid refresh token.
 */
export function refreshHandler(req: Request, res: Response): void {
  const { refreshToken: token } = req.body;

  if (!token) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Refresh token is required',
    });
    return;
  }

  try {
    const result = refreshToken(token);
    res.status(200).json(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      res.status(401).json({
        error: 'Invalid refresh token',
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/**
 * POST /api/auth/logout
 * Invalidates the provided refresh token.
 */
export function logoutHandler(req: Request, res: Response): void {
  const { refreshToken: token } = req.body;

  if (!token) {
    res.status(400).json({
      error: 'Validation error',
      message: 'Refresh token is required',
    });
    return;
  }

  logout(token);
  res.status(200).json({
    message: 'Logged out successfully',
  });
}
