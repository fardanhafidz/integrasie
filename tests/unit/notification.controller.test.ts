import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { getConfigHandler, updateConfigHandler } from '../../src/server/modules/notification/notification.controller';

/**
 * Unit tests for Notification Controller
 * Validates: Requirements 7.5, 7.6
 */

// Mock Prisma
vi.mock('../../src/server/config/database', () => ({
  prisma: {
    notificationConfig: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../src/server/config/database';

function createMockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

describe('Notification Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfigHandler', () => {
    it('should return 200 with configs grouped by alert_category', async () => {
      const mockConfigs = [
        { id: '1', alert_category: 'temperature_breach', user_id: 'u1', phone_number: '+6281234567890', is_active: true },
        { id: '2', alert_category: 'temperature_breach', user_id: 'u2', phone_number: '+6281234567891', is_active: true },
        { id: '3', alert_category: 'lot_ready', user_id: 'u3', phone_number: '+6281234567892', is_active: true },
      ];

      (prisma.notificationConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfigs);

      const req = createMockRequest();
      const res = createMockResponse();

      await getConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: {
          temperature_breach: [
            { id: '1', userId: 'u1', phoneNumber: '+6281234567890', isActive: true },
            { id: '2', userId: 'u2', phoneNumber: '+6281234567891', isActive: true },
          ],
          lot_ready: [
            { id: '3', userId: 'u3', phoneNumber: '+6281234567892', isActive: true },
          ],
        },
      });
    });

    it('should return 200 with empty data when no configs exist', async () => {
      (prisma.notificationConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const req = createMockRequest();
      const res = createMockResponse();

      await getConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: {} });
    });

    it('should return 500 on database error', async () => {
      (prisma.notificationConfig.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection failed'));

      const req = createMockRequest();
      const res = createMockResponse();

      await getConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'DB connection failed',
      });
    });
  });

  describe('updateConfigHandler', () => {
    it('should return 400 when category is missing', async () => {
      const req = createMockRequest({
        body: { recipients: [{ userId: 'u1', phoneNumber: '+6281234567890' }] },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          message: 'Category is required and must be a non-empty string',
        })
      );
    });

    it('should return 400 when category is empty string', async () => {
      const req = createMockRequest({
        body: { category: '   ', recipients: [{ userId: 'u1', phoneNumber: '+6281234567890' }] },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          message: 'Category is required and must be a non-empty string',
        })
      );
    });

    it('should return 400 when recipients is not an array', async () => {
      const req = createMockRequest({
        body: { category: 'temperature_breach', recipients: 'not-an-array' },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          message: 'Recipients must be an array',
        })
      );
    });

    it('should return 400 when recipients array is empty', async () => {
      const req = createMockRequest({
        body: { category: 'temperature_breach', recipients: [] },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          message: 'At least one recipient is required per category',
        })
      );
    });

    it('should return 400 when phone number is not E.164 format', async () => {
      const req = createMockRequest({
        body: {
          category: 'temperature_breach',
          recipients: [{ userId: 'u1', phoneNumber: '081234567890' }],
        },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          message: 'One or more recipients have invalid phone numbers',
          details: expect.arrayContaining([
            expect.stringContaining('not valid E.164 format'),
          ]),
        })
      );
    });

    it('should return 400 when phone number starts with +0', async () => {
      const req = createMockRequest({
        body: {
          category: 'temperature_breach',
          recipients: [{ userId: 'u1', phoneNumber: '+0812345678' }],
        },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
        })
      );
    });

    it('should return 400 when userId is missing', async () => {
      const req = createMockRequest({
        body: {
          category: 'temperature_breach',
          recipients: [{ phoneNumber: '+6281234567890' }],
        },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          details: expect.arrayContaining([
            expect.stringContaining('userId is required'),
          ]),
        })
      );
    });

    it('should return 200 on successful update with valid E.164 phone numbers', async () => {
      const savedConfigs = [
        { id: 'new-1', user_id: 'u1', phone_number: '+6281234567890', is_active: true },
        { id: 'new-2', user_id: 'u2', phone_number: '+14155552671', is_active: true },
      ];

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
        await fn({
          notificationConfig: {
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
            createMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
        });
      });

      (prisma.notificationConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(savedConfigs);

      const req = createMockRequest({
        body: {
          category: 'temperature_breach',
          recipients: [
            { userId: 'u1', phoneNumber: '+6281234567890' },
            { userId: 'u2', phoneNumber: '+14155552671' },
          ],
        },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Configuration updated successfully',
        data: {
          category: 'temperature_breach',
          recipients: [
            { id: 'new-1', userId: 'u1', phoneNumber: '+6281234567890', isActive: true },
            { id: 'new-2', userId: 'u2', phoneNumber: '+14155552671', isActive: true },
          ],
        },
      });
    });

    it('should accept valid international E.164 numbers', async () => {
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: Function) => {
        await fn({
          notificationConfig: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });

      (prisma.notificationConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'new-1', user_id: 'u1', phone_number: '+447911123456', is_active: true },
      ]);

      const req = createMockRequest({
        body: {
          category: 'lot_ready',
          recipients: [{ userId: 'u1', phoneNumber: '+447911123456' }],
        },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 on database error during transaction', async () => {
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Transaction failed'));

      const req = createMockRequest({
        body: {
          category: 'temperature_breach',
          recipients: [{ userId: 'u1', phoneNumber: '+6281234567890' }],
        },
      });
      const res = createMockResponse();

      await updateConfigHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Transaction failed',
      });
    });
  });
});
