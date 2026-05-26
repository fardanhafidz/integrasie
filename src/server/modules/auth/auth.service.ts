import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { comparePassword } from '../../shared/password';
import { env } from '../../config/env';
import { UserRole } from '../../shared/types';

/**
 * Auth Service
 *
 * Handles authentication business logic: login, token generation,
 * refresh token management, account lockout, and session timeout.
 *
 * Validates: Requirements 1.1, 1.8, 1.9
 */

/**
 * Custom error class for authentication errors with HTTP status codes.
 */
export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

/** In-memory tracking of failed login attempts per user ID */
const failedAttempts = new Map<string, { count: number; lockedUntil: Date | null }>();

/** In-memory refresh token blacklist (revoked tokens) */
const refreshTokenBlacklist = new Set<string>();

/** Session timeout in milliseconds */
const SESSION_TIMEOUT_MS = env.SESSION_TIMEOUT_MINUTES * 60 * 1000;

/**
 * Reset internal state (for testing purposes).
 */
export function _resetState(): void {
  failedAttempts.clear();
  refreshTokenBlacklist.clear();
}

/**
 * Get failed attempts map (for testing purposes).
 */
export function _getFailedAttempts(): Map<string, { count: number; lockedUntil: Date | null }> {
  return failedAttempts;
}

/**
 * Get refresh token blacklist (for testing purposes).
 */
export function _getRefreshTokenBlacklist(): Set<string> {
  return refreshTokenBlacklist;
}

/**
 * Generate access and refresh token pair for a user.
 */
export function generateTokens(user: {
  userId: string;
  email: string;
  role: string;
}): { accessToken: string; refreshToken: string } {
  const payload = {
    userId: user.userId,
    email: user.email,
    role: user.role as UserRole,
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRY,
  });

  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY,
  });

  return { accessToken, refreshToken };
}

/**
 * Authenticate user with email and password.
 *
 * @throws AuthError with 401 for invalid credentials
 * @throws AuthError with 423 for locked account
 * @throws AuthError with 403 for inactive account
 */
export async function login(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string; role: string; fullName: string } }> {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AuthError('Invalid credentials', 401);
  }

  // Check if account is locked
  const attempts = failedAttempts.get(user.id);
  if (attempts?.lockedUntil && attempts.lockedUntil > new Date()) {
    throw new AuthError('Account locked due to too many failed attempts', 423);
  }

  // If lockout has expired, reset
  if (attempts?.lockedUntil && attempts.lockedUntil <= new Date()) {
    failedAttempts.delete(user.id);
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    const current = failedAttempts.get(user.id) || { count: 0, lockedUntil: null };
    const newCount = current.count + 1;

    if (newCount >= env.MAX_LOGIN_ATTEMPTS) {
      failedAttempts.set(user.id, {
        count: newCount,
        lockedUntil: new Date(Date.now() + env.LOCKOUT_DURATION_MINUTES * 60 * 1000),
      });
      throw new AuthError('Account locked due to too many failed attempts', 423);
    }

    failedAttempts.set(user.id, { count: newCount, lockedUntil: null });
    throw new AuthError('Invalid credentials', 401);
  }

  // Check if user is active
  if (!user.is_active) {
    throw new AuthError('Account is deactivated', 403);
  }

  // Reset failed attempts on successful login
  failedAttempts.delete(user.id);

  // Generate tokens
  const tokens = generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    },
  };
}

/**
 * Refresh access token using a valid refresh token.
 *
 * @throws AuthError with 401 for invalid/expired/blacklisted refresh token
 */
export function refreshToken(
  token: string
): { accessToken: string } {
  // Check if token is blacklisted
  if (refreshTokenBlacklist.has(token)) {
    throw new AuthError('Refresh token has been revoked', 401);
  }

  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as {
      userId: string;
      email: string;
      role: string;
    };

    // Generate new access token only
    const accessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, role: decoded.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRY }
    );

    return { accessToken };
  } catch (error: unknown) {
    throw new AuthError('Invalid or expired refresh token', 401);
  }
}

/**
 * Invalidate a refresh token (logout).
 * Adds the token to the blacklist.
 */
export function logout(token: string): void {
  refreshTokenBlacklist.add(token);
}

/**
 * Check if a session has timed out based on last activity timestamp.
 * Returns true if the session has exceeded the configured timeout (30 minutes).
 *
 * Validates: Requirement 1.9
 */
export function checkSessionTimeout(lastActivity: Date): boolean {
  const elapsed = Date.now() - lastActivity.getTime();
  return elapsed > SESSION_TIMEOUT_MS;
}
