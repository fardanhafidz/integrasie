import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  login,
  refreshToken,
  logout,
  generateTokens,
  checkSessionTimeout,
  AuthError,
  _resetState,
  _getFailedAttempts,
  _getRefreshTokenBlacklist,
} from '@server/modules/auth/auth.service';
import { env } from '@server/config/env';

// Mock Prisma
vi.mock('@server/config/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock password utility
vi.mock('@server/shared/password', () => ({
  comparePassword: vi.fn(),
}));

import { prisma } from '@server/config/database';
import { comparePassword } from '@server/shared/password';

const mockUser = {
  id: 'user-123',
  email: 'operator@test.com',
  password_hash: '$2b$12$hashedpassword',
  full_name: 'Test User',
  role: 'warehouse_operator',
  phone_number: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('Auth Service', () => {
  beforeEach(() => {
    _resetState();
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should return tokens and user info on successful login', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(true);

      const result = await login('operator@test.com', 'ValidPass1');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe('user-123');
      expect(result.user.email).toBe('operator@test.com');
      expect(result.user.fullName).toBe('Test User');
      expect(result.user.role).toBe('warehouse_operator');
    });

    it('should throw AuthError with 401 for non-existent email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      try {
        await login('nonexistent@test.com', 'password');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).statusCode).toBe(401);
        expect((error as AuthError).message).toBe('Invalid credentials');
      }
    });

    it('should throw AuthError with 401 for wrong password', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(false);

      try {
        await login('operator@test.com', 'WrongPass1');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).statusCode).toBe(401);
      }
    });

    it('should throw AuthError with 403 for inactive account', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        is_active: false,
      } as any);
      vi.mocked(comparePassword).mockResolvedValue(true);

      try {
        await login('operator@test.com', 'ValidPass1');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).statusCode).toBe(403);
      }
    });

    it('should track failed login attempts', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(false);

      try {
        await login('operator@test.com', 'WrongPass1');
      } catch {
        // expected
      }

      const attempts = _getFailedAttempts();
      expect(attempts.get('user-123')?.count).toBe(1);
    });

    it('should lock account after 5 consecutive failed attempts', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(false);

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        try {
          await login('operator@test.com', 'WrongPass1');
        } catch {
          // expected
        }
      }

      const attempts = _getFailedAttempts();
      expect(attempts.get('user-123')?.lockedUntil).not.toBeNull();

      // 6th attempt should get lockout error (423)
      try {
        await login('operator@test.com', 'WrongPass1');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).statusCode).toBe(423);
      }
    });

    it('should clear failed attempts on successful login', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      // First, make some failed attempts
      vi.mocked(comparePassword).mockResolvedValue(false);
      try { await login('operator@test.com', 'WrongPass1'); } catch { /* expected */ }
      try { await login('operator@test.com', 'WrongPass1'); } catch { /* expected */ }

      expect(_getFailedAttempts().get('user-123')?.count).toBe(2);

      // Now succeed
      vi.mocked(comparePassword).mockResolvedValue(true);
      await login('operator@test.com', 'ValidPass1');

      expect(_getFailedAttempts().has('user-123')).toBe(false);
    });

    it('should generate valid JWT access token with correct payload', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(comparePassword).mockResolvedValue(true);

      const result = await login('operator@test.com', 'ValidPass1');
      const decoded = jwt.verify(result.accessToken, env.JWT_SECRET) as any;

      expect(decoded.userId).toBe('user-123');
      expect(decoded.email).toBe('operator@test.com');
      expect(decoded.role).toBe('warehouse_operator');
    });
  });

  describe('refreshToken', () => {
    it('should return a new access token for a valid refresh token', () => {
      const tokens = generateTokens({
        userId: 'user-123',
        email: 'operator@test.com',
        role: 'warehouse_operator' as any,
      });

      const result = refreshToken(tokens.refreshToken);
      expect(result.accessToken).toBeDefined();

      const decoded = jwt.verify(result.accessToken, env.JWT_SECRET) as any;
      expect(decoded.userId).toBe('user-123');
      expect(decoded.email).toBe('operator@test.com');
      expect(decoded.role).toBe('warehouse_operator');
    });

    it('should throw AuthError for blacklisted refresh token', () => {
      const tokens = generateTokens({
        userId: 'user-123',
        email: 'operator@test.com',
        role: 'warehouse_operator' as any,
      });

      logout(tokens.refreshToken);

      try {
        refreshToken(tokens.refreshToken);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe('Refresh token has been revoked');
        expect((error as AuthError).statusCode).toBe(401);
      }
    });

    it('should throw AuthError for invalid refresh token', () => {
      try {
        refreshToken('invalid-token');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe('Invalid or expired refresh token');
        expect((error as AuthError).statusCode).toBe(401);
      }
    });

    it('should throw AuthError for token signed with wrong secret', () => {
      const fakeToken = jwt.sign(
        { userId: 'user-123', email: 'test@test.com', role: 'warehouse_operator' },
        'wrong-secret',
        { expiresIn: '7d' }
      );

      try {
        refreshToken(fakeToken);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).statusCode).toBe(401);
      }
    });
  });

  describe('logout', () => {
    it('should add refresh token to blacklist', () => {
      const tokens = generateTokens({
        userId: 'user-123',
        email: 'operator@test.com',
        role: 'warehouse_operator' as any,
      });

      logout(tokens.refreshToken);

      const blacklist = _getRefreshTokenBlacklist();
      expect(blacklist.has(tokens.refreshToken)).toBe(true);
    });

    it('should prevent refreshing a logged-out token', () => {
      const tokens = generateTokens({
        userId: 'user-123',
        email: 'operator@test.com',
        role: 'warehouse_operator' as any,
      });

      logout(tokens.refreshToken);

      expect(() => refreshToken(tokens.refreshToken)).toThrow(AuthError);
    });
  });

  describe('generateTokens', () => {
    it('should generate both access and refresh tokens', () => {
      const tokens = generateTokens({
        userId: 'user-123',
        email: 'operator@test.com',
        role: 'warehouse_operator' as any,
      });

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });

    it('should create access token with correct payload', () => {
      const tokens = generateTokens({
        userId: 'user-456',
        email: 'qc@test.com',
        role: 'qc_staff' as any,
      });

      const decoded = jwt.verify(tokens.accessToken, env.JWT_SECRET) as any;
      expect(decoded.userId).toBe('user-456');
      expect(decoded.email).toBe('qc@test.com');
      expect(decoded.role).toBe('qc_staff');
    });

    it('should create refresh token verifiable with refresh secret', () => {
      const tokens = generateTokens({
        userId: 'user-789',
        email: 'manager@test.com',
        role: 'factory_manager' as any,
      });

      const decoded = jwt.verify(tokens.refreshToken, env.JWT_REFRESH_SECRET) as any;
      expect(decoded.userId).toBe('user-789');
      expect(decoded.email).toBe('manager@test.com');
      expect(decoded.role).toBe('factory_manager');
    });

    it('should not be verifiable with the wrong secret', () => {
      const tokens = generateTokens({
        userId: 'user-123',
        email: 'test@test.com',
        role: 'warehouse_operator' as any,
      });

      // Access token should not verify with refresh secret
      expect(() => jwt.verify(tokens.accessToken, env.JWT_REFRESH_SECRET)).toThrow();
      // Refresh token should not verify with access secret
      expect(() => jwt.verify(tokens.refreshToken, env.JWT_SECRET)).toThrow();
    });
  });

  describe('checkSessionTimeout', () => {
    it('should return false for activity within 30 minutes', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      expect(checkSessionTimeout(tenMinutesAgo)).toBe(false);
    });

    it('should return false for activity exactly at 30 minutes', () => {
      const exactlyThirtyMinutes = new Date(Date.now() - 30 * 60 * 1000);
      expect(checkSessionTimeout(exactlyThirtyMinutes)).toBe(false);
    });

    it('should return true for activity more than 30 minutes ago', () => {
      const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
      expect(checkSessionTimeout(thirtyOneMinutesAgo)).toBe(true);
    });

    it('should return true for activity 1 hour ago', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      expect(checkSessionTimeout(oneHourAgo)).toBe(true);
    });

    it('should return false for current time', () => {
      expect(checkSessionTimeout(new Date())).toBe(false);
    });
  });
});
