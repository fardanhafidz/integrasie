import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { loginHandler, refreshHandler, logoutHandler } from '@server/modules/auth/auth.controller';
import { AuthError } from '@server/modules/auth/auth.service';

// Mock auth service
vi.mock('@server/modules/auth/auth.service', () => ({
  login: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'AuthError';
      this.statusCode = statusCode;
    }
  },
}));

import { login, refreshToken, logout } from '@server/modules/auth/auth.service';

function mockRequest(body: Record<string, unknown> = {}): Partial<Request> {
  return { body };
}

function mockResponse(): Partial<Response> & { statusCode: number; jsonData: unknown } {
  const res: Partial<Response> & { statusCode: number; jsonData: unknown } = {
    statusCode: 200,
    jsonData: null,
    status(code: number) {
      res.statusCode = code;
      return res as Response;
    },
    json(data: unknown) {
      res.jsonData = data;
      return res as Response;
    },
  };
  return res;
}

describe('Auth Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loginHandler', () => {
    it('should return 400 when email is missing', async () => {
      const req = mockRequest({ password: 'test123' });
      const res = mockResponse();

      await loginHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: 'Validation error',
        message: 'Email and password are required',
      });
    });

    it('should return 400 when password is missing', async () => {
      const req = mockRequest({ email: 'test@test.com' });
      const res = mockResponse();

      await loginHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: 'Validation error',
        message: 'Email and password are required',
      });
    });

    it('should return 400 when both email and password are missing', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await loginHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: 'Validation error',
        message: 'Email and password are required',
      });
    });

    it('should return 200 with tokens on successful login', async () => {
      const mockResult = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1', email: 'test@test.com', role: 'warehouse_operator', fullName: 'Test' },
      };
      vi.mocked(login).mockResolvedValue(mockResult);

      const req = mockRequest({ email: 'test@test.com', password: 'ValidPass1' });
      const res = mockResponse();

      await loginHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual(mockResult);
      expect(login).toHaveBeenCalledWith('test@test.com', 'ValidPass1');
    });

    it('should return 401 with generic message on invalid credentials (Req 1.8)', async () => {
      const { AuthError: MockAuthError } = await import('@server/modules/auth/auth.service');
      vi.mocked(login).mockRejectedValue(new MockAuthError('Invalid credentials', 401));

      const req = mockRequest({ email: 'test@test.com', password: 'wrong' });
      const res = mockResponse();

      await loginHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Authentication failed' });
    });

    it('should return 423 when account is locked', async () => {
      const { AuthError: MockAuthError } = await import('@server/modules/auth/auth.service');
      vi.mocked(login).mockRejectedValue(
        new MockAuthError('Account locked due to too many failed attempts', 423)
      );

      const req = mockRequest({ email: 'test@test.com', password: 'wrong' });
      const res = mockResponse();

      await loginHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(423);
      expect(res.jsonData).toEqual({
        error: 'Account locked',
        message: 'Too many failed attempts. Try again later.',
      });
    });

    it('should return 401 for inactive account (no hint about deactivation)', async () => {
      const { AuthError: MockAuthError } = await import('@server/modules/auth/auth.service');
      vi.mocked(login).mockRejectedValue(new MockAuthError('Account is deactivated', 403));

      const req = mockRequest({ email: 'test@test.com', password: 'ValidPass1' });
      const res = mockResponse();

      await loginHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Authentication failed' });
    });

    it('should return 500 on unexpected error', async () => {
      vi.mocked(login).mockRejectedValue(new Error('Database connection failed'));

      const req = mockRequest({ email: 'test@test.com', password: 'ValidPass1' });
      const res = mockResponse();

      await loginHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual({ error: 'Internal server error' });
    });
  });

  describe('refreshHandler', () => {
    it('should return 400 when refreshToken is missing', () => {
      const req = mockRequest({});
      const res = mockResponse();

      refreshHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: 'Validation error',
        message: 'Refresh token is required',
      });
    });

    it('should return 200 with new access token on valid refresh', () => {
      vi.mocked(refreshToken).mockReturnValue({ accessToken: 'new-access-token' });

      const req = mockRequest({ refreshToken: 'valid-refresh-token' });
      const res = mockResponse();

      refreshHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual({ accessToken: 'new-access-token' });
      expect(refreshToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should return 401 when refresh token is invalid', async () => {
      const { AuthError: MockAuthError } = await import('@server/modules/auth/auth.service');
      vi.mocked(refreshToken).mockImplementation(() => {
        throw new MockAuthError('Invalid or expired refresh token', 401);
      });

      const req = mockRequest({ refreshToken: 'invalid-token' });
      const res = mockResponse();

      refreshHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({ error: 'Invalid refresh token' });
    });

    it('should return 500 on unexpected error', () => {
      vi.mocked(refreshToken).mockImplementation(() => {
        throw new Error('Unexpected');
      });

      const req = mockRequest({ refreshToken: 'some-token' });
      const res = mockResponse();

      refreshHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual({ error: 'Internal server error' });
    });
  });

  describe('logoutHandler', () => {
    it('should return 400 when refreshToken is missing', () => {
      const req = mockRequest({});
      const res = mockResponse();

      logoutHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toEqual({
        error: 'Validation error',
        message: 'Refresh token is required',
      });
    });

    it('should return 200 on successful logout', () => {
      const req = mockRequest({ refreshToken: 'valid-refresh-token' });
      const res = mockResponse();

      logoutHandler(req as Request, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData).toEqual({ message: 'Logged out successfully' });
      expect(logout).toHaveBeenCalledWith('valid-refresh-token');
    });
  });
});
