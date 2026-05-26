import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { rbacMiddleware } from '../../src/server/middleware/rbac';
import { UserRole, JwtPayload } from '../../src/server/shared/types';

/**
 * Unit tests for RBAC middleware
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7
 */

function createMockRequest(overrides: Partial<Request> & { user?: JwtPayload } = {}): Request {
  const { user, ...rest } = overrides;
  const req = {
    method: 'GET',
    path: '/api/intakes',
    ...rest,
  } as unknown as Request;

  if (user) {
    (req as Request & { user: JwtPayload }).user = user;
  }

  return req;
}

function createMockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function createMockNext(): NextFunction {
  return vi.fn();
}

describe('RBAC Middleware', () => {
  describe('Unauthenticated requests (no req.user)', () => {
    it('should return 401 when req.user is not set', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when req.user is undefined', () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Authorized access (role has permission)', () => {
    it('should call next() when Warehouse_Operator accesses /api/intakes with POST', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/intakes',
        user: { userId: 'user-1', email: 'op@test.com', role: UserRole.WAREHOUSE_OPERATOR },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next() when QC_Staff accesses /api/qc/:lotId/result with POST', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/qc/lot-abc-123/result',
        user: { userId: 'user-2', email: 'qc@test.com', role: UserRole.QC_STAFF },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next() when PPIC_Team accesses /api/ppic/stock with GET', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/ppic/stock',
        user: { userId: 'user-3', email: 'ppic@test.com', role: UserRole.PPIC_TEAM },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next() when Factory_Manager accesses any route', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/audit',
        user: { userId: 'user-4', email: 'mgr@test.com', role: UserRole.FACTORY_MANAGER },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow all roles to access auth routes', () => {
      const roles = [
        UserRole.WAREHOUSE_OPERATOR,
        UserRole.QC_STAFF,
        UserRole.PPIC_TEAM,
        UserRole.FACTORY_MANAGER,
      ];

      for (const role of roles) {
        const req = createMockRequest({
          method: 'POST',
          path: '/api/auth/login',
          user: { userId: 'user-x', email: 'x@test.com', role },
        });
        const res = createMockResponse();
        const next = createMockNext();

        rbacMiddleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    });
  });

  describe('Unauthorized access (role lacks permission) - Requirement 1.7', () => {
    it('should return 403 when Warehouse_Operator accesses /api/audit', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/audit',
        user: { userId: 'user-1', email: 'op@test.com', role: UserRole.WAREHOUSE_OPERATOR },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied',
        message: 'You do not have the required role for the requested resource',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when QC_Staff accesses /api/intakes with POST', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/intakes',
        user: { userId: 'user-2', email: 'qc@test.com', role: UserRole.QC_STAFF },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied',
        message: 'You do not have the required role for the requested resource',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when PPIC_Team accesses /api/slotting routes', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/slotting/lot-123/recommendations',
        user: { userId: 'user-3', email: 'ppic@test.com', role: UserRole.PPIC_TEAM },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when QC_Staff accesses /api/notifications/config', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/notifications/config',
        user: { userId: 'user-2', email: 'qc@test.com', role: UserRole.QC_STAFF },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when Warehouse_Operator accesses /api/ppic/schedules with POST', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/ppic/schedules',
        user: { userId: 'user-1', email: 'op@test.com', role: UserRole.WAREHOUSE_OPERATOR },
      });
      const res = createMockResponse();
      const next = createMockNext();

      rbacMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
