import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '@server/middleware/auth';
import { env } from '@server/config/env';
import { UserRole } from '@server/shared/types';

// Mock the auth service's checkSessionTimeout
vi.mock('@server/modules/auth/auth.service', () => ({
  checkSessionTimeout: vi.fn(),
}));

import { checkSessionTimeout } from '@server/modules/auth/auth.service';

function createMockRequest(headers: Record<string, string> = {}): Partial<Request> {
  return {
    headers,
  };
}

function createMockResponse(): Partial<Response> & { statusCode?: number; body?: any } {
  const res: Partial<Response> & { statusCode?: number; body?: any } = {};
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

describe('Auth Middleware', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
    vi.mocked(checkSessionTimeout).mockReturnValue(false);
  });

  describe('Token extraction', () => {
    it('should return 401 when no Authorization header is present', () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'No token provided',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header does not start with Bearer', () => {
      const req = createMockRequest({ authorization: 'Basic some-token' });
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'No token provided',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when Bearer token is empty', () => {
      const req = createMockRequest({ authorization: 'Bearer ' });
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'No token provided',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Token verification', () => {
    it('should return 401 for an invalid token', () => {
      const req = createMockRequest({ authorization: 'Bearer invalid-token' });
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for a token signed with wrong secret', () => {
      const token = jwt.sign(
        { userId: 'user-123', email: 'test@test.com', role: UserRole.WAREHOUSE_OPERATOR },
        'wrong-secret',
        { expiresIn: '15m' }
      );
      const req = createMockRequest({ authorization: `Bearer ${token}` });
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for an expired token', () => {
      const token = jwt.sign(
        { userId: 'user-123', email: 'test@test.com', role: UserRole.QC_STAFF },
        env.JWT_SECRET,
        { expiresIn: '0s' } // immediately expired
      );
      const req = createMockRequest({ authorization: `Bearer ${token}` });
      const res = createMockResponse();

      // Small delay to ensure token is expired
      authMiddleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body).toEqual({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next() and attach user for a valid token', () => {
      const payload = { userId: 'user-123', email: 'operator@test.com', role: UserRole.WAREHOUSE_OPERATOR };
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
      const req = createMockRequest({ authorization: `Bearer ${token}` });
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((req as any).user).toBeDefined();
      expect((req as any).user.userId).toBe('user-123');
      expect((req as any).user.email).toBe('operator@test.com');
      expect((req as any).user.role).toBe(UserRole.WAREHOUSE_OPERATOR);
    });

    it('should attach user with all roles correctly', () => {
      const roles = [UserRole.WAREHOUSE_OPERATOR, UserRole.QC_STAFF, UserRole.PPIC_TEAM, UserRole.FACTORY_MANAGER];

      for (const role of roles) {
        const payload = { userId: 'user-123', email: 'test@test.com', role };
        const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
        const req = createMockRequest({ authorization: `Bearer ${token}` });
        const res = createMockResponse();
        const next = vi.fn();

        authMiddleware(req as Request, res as Response, next);

        expect(next).toHaveBeenCalled();
        expect((req as any).user.role).toBe(role);
      }
    });
  });

  describe('Session timeout', () => {
    it('should return 401 with session expired message when session has timed out', () => {
      vi.mocked(checkSessionTimeout).mockReturnValue(true);

      const payload = { userId: 'user-123', email: 'test@test.com', role: UserRole.WAREHOUSE_OPERATOR };
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
      const req = createMockRequest({ authorization: `Bearer ${token}` });
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body).toEqual({
        error: 'Session expired',
        message: 'Session has timed out due to inactivity',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next() when session has not timed out', () => {
      vi.mocked(checkSessionTimeout).mockReturnValue(false);

      const payload = { userId: 'user-123', email: 'test@test.com', role: UserRole.FACTORY_MANAGER };
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
      const req = createMockRequest({ authorization: `Bearer ${token}` });
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should pass iat-based Date to checkSessionTimeout', () => {
      vi.mocked(checkSessionTimeout).mockReturnValue(false);

      const payload = { userId: 'user-123', email: 'test@test.com', role: UserRole.WAREHOUSE_OPERATOR };
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
      const req = createMockRequest({ authorization: `Bearer ${token}` });
      const res = createMockResponse();

      authMiddleware(req as Request, res as Response, mockNext);

      expect(checkSessionTimeout).toHaveBeenCalledWith(expect.any(Date));
      // The Date passed should be close to now (within a few seconds)
      const passedDate = vi.mocked(checkSessionTimeout).mock.calls[0][0] as Date;
      const now = Date.now();
      expect(Math.abs(now - passedDate.getTime())).toBeLessThan(5000);
    });
  });
});
