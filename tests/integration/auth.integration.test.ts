import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { hashPassword } from '../../src/server/shared/password';
import { env } from '../../src/server/config/env';
import { UserRole } from '../../src/server/shared/types';
import { _resetState, generateTokens } from '../../src/server/modules/auth/auth.service';
import authRoutes from '../../src/server/modules/auth/auth.routes';
import { authMiddleware } from '../../src/server/middleware/auth';
import { rbacMiddleware } from '../../src/server/middleware/rbac';

/**
 * Integration tests for Authentication and Role-Based Access Control
 *
 * Tests the full HTTP request/response cycle for:
 * - Login success/failure
 * - Token refresh
 * - Account lockout after 5 failed attempts
 * - RBAC enforcement (403 for unauthorized roles, 401 for unauthenticated)
 *
 * Validates: Requirements 1.1, 1.7, 1.8
 */

// Mock Prisma
vi.mock('../../src/server/config/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/server/config/database';

const mockedPrisma = vi.mocked(prisma);

// Test user data
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_USER_EMAIL = 'operator@integrasie.com';
const TEST_USER_PASSWORD = 'SecurePass1';
const TEST_USER_ROLE = UserRole.WAREHOUSE_OPERATOR;
const TEST_USER_FULL_NAME = 'Test Operator';

let hashedPassword: string;

/**
 * Creates a test Express app with auth routes and protected routes for RBAC testing.
 */
function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());

  // Auth routes (public)
  app.use('/api/auth', authRoutes);

  // Protected routes for RBAC testing
  app.get('/api/audit', authMiddleware, rbacMiddleware, (_req: Request, res: Response) => {
    res.status(200).json({ data: [] });
  });

  app.post('/api/intakes', authMiddleware, rbacMiddleware, (_req: Request, res: Response) => {
    res.status(201).json({ id: 'new-intake' });
  });

  app.get('/api/intakes', authMiddleware, rbacMiddleware, (_req: Request, res: Response) => {
    res.status(200).json({ data: [] });
  });

  return app;
}

describe('Auth Integration Tests', () => {
  let app: express.Application;

  beforeEach(async () => {
    _resetState();
    vi.clearAllMocks();
    hashedPassword = await hashPassword(TEST_USER_PASSWORD);
    app = createTestApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return tokens and user info on successful login', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        password_hash: hashedPassword,
        full_name: TEST_USER_FULL_NAME,
        role: TEST_USER_ROLE,
        is_active: true,
        phone_number: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(TEST_USER_ID);
      expect(response.body.user.email).toBe(TEST_USER_EMAIL);
      expect(response.body.user.role).toBe(TEST_USER_ROLE);
      expect(response.body.user.fullName).toBe(TEST_USER_FULL_NAME);

      // Verify the access token is a valid JWT
      const decoded = jwt.verify(response.body.accessToken, env.JWT_SECRET) as any;
      expect(decoded.userId).toBe(TEST_USER_ID);
      expect(decoded.email).toBe(TEST_USER_EMAIL);
      expect(decoded.role).toBe(TEST_USER_ROLE);
    });

    it('should return 401 with generic message for invalid credentials', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        password_hash: hashedPassword,
        full_name: TEST_USER_FULL_NAME,
        role: TEST_USER_ROLE,
        is_active: true,
        phone_number: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_USER_EMAIL, password: 'WrongPassword1' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication failed');
      // Should NOT reveal which field is wrong (Requirement 1.8)
      expect(response.body.message).toBeUndefined();
    });

    it('should return 401 with generic message for non-existent user', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'SomePass1' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication failed');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: TEST_USER_PASSWORD });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.message).toContain('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_USER_EMAIL });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.message).toContain('Email and password are required');
    });

    it('should return 400 when both fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });

    it('should return 423 after 5 consecutive failed login attempts (account lockout)', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        password_hash: hashedPassword,
        full_name: TEST_USER_FULL_NAME,
        role: TEST_USER_ROLE,
        is_active: true,
        phone_number: null,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      // Make 5 failed attempts
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: TEST_USER_EMAIL, password: 'WrongPassword1' });
        expect(res.status).toBe(401);
      }

      // 5th attempt should trigger lockout
      const lockoutResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_USER_EMAIL, password: 'WrongPassword1' });

      expect(lockoutResponse.status).toBe(423);
      expect(lockoutResponse.body.error).toBe('Account locked');

      // Subsequent attempts (even with correct password) should return 423
      const afterLockoutResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });

      expect(afterLockoutResponse.status).toBe(423);
      expect(afterLockoutResponse.body.error).toBe('Account locked');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return a new access token with a valid refresh token', async () => {
      // Generate a valid refresh token
      const tokens = generateTokens({
        userId: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        role: TEST_USER_ROLE,
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');

      // Verify the new access token is valid
      const decoded = jwt.verify(response.body.accessToken, env.JWT_SECRET) as any;
      expect(decoded.userId).toBe(TEST_USER_ID);
      expect(decoded.email).toBe(TEST_USER_EMAIL);
      expect(decoded.role).toBe(TEST_USER_ROLE);
    });

    it('should return 401 for an invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token-string' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid refresh token');
    });

    it('should return 401 for an expired refresh token', async () => {
      // Create a token that is already expired
      const expiredToken = jwt.sign(
        { userId: TEST_USER_ID, email: TEST_USER_EMAIL, role: TEST_USER_ROLE },
        env.JWT_REFRESH_SECRET,
        { expiresIn: '0s' }
      );

      // Small delay to ensure token is expired
      await new Promise((resolve) => setTimeout(resolve, 10));

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid refresh token');
    });

    it('should return 400 when refresh token is missing', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should invalidate the refresh token and return success', async () => {
      // Generate tokens
      const tokens = generateTokens({
        userId: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        role: TEST_USER_ROLE,
      });

      // Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: tokens.refreshToken });

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.message).toBe('Logged out successfully');

      // Attempt to use the invalidated refresh token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: tokens.refreshToken });

      expect(refreshResponse.status).toBe(401);
      expect(refreshResponse.body.error).toBe('Invalid refresh token');
    });
  });

  describe('RBAC Enforcement', () => {
    it('should return 403 when Warehouse_Operator accesses /api/audit', async () => {
      // Generate a valid access token for Warehouse_Operator
      const tokens = generateTokens({
        userId: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        role: UserRole.WAREHOUSE_OPERATOR,
      });

      const response = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should return 403 when QC_Staff accesses POST /api/intakes', async () => {
      // Generate a valid access token for QC_Staff
      const tokens = generateTokens({
        userId: TEST_USER_ID,
        email: 'qc@integrasie.com',
        role: UserRole.QC_STAFF,
      });

      const response = await request(app)
        .post('/api/intakes')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .send({ supplier_name: 'Test Supplier' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should return 401 when unauthenticated request hits a protected route', async () => {
      const response = await request(app)
        .get('/api/audit');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.message).toBe('No token provided');
    });

    it('should allow Factory_Manager to access /api/audit', async () => {
      const tokens = generateTokens({
        userId: TEST_USER_ID,
        email: 'manager@integrasie.com',
        role: UserRole.FACTORY_MANAGER,
      });

      const response = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(response.status).toBe(200);
    });

    it('should allow Warehouse_Operator to access GET /api/intakes', async () => {
      const tokens = generateTokens({
        userId: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        role: UserRole.WAREHOUSE_OPERATOR,
      });

      const response = await request(app)
        .get('/api/intakes')
        .set('Authorization', `Bearer ${tokens.accessToken}`);

      expect(response.status).toBe(200);
    });

    it('should return 401 for an invalid/malformed JWT token', async () => {
      const response = await request(app)
        .get('/api/audit')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.message).toBe('Invalid or expired token');
    });
  });
});
