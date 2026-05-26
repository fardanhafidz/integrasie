import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Socket.IO server using vi.hoisted to avoid hoisting issues
const mockEmit = vi.hoisted(() => vi.fn());
vi.mock('@server/index', () => ({
  io: {
    emit: mockEmit,
  },
}));

// Mock the database module to prevent Prisma client initialization
vi.mock('@server/config/database', () => ({
  prisma: {},
}));

import {
  emitLotReadyToStore,
  sendBreachWhatsAppAlert,
} from '@server/modules/notification/notification.service';

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('emitLotReadyToStore', () => {
    it('should emit lot:ready_to_store event with correct payload', () => {
      emitLotReadyToStore('lot-123', 'CHM-20250115-0001', 'Chemicals');

      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith('lot:ready_to_store', {
        lotId: 'lot-123',
        lotNumber: 'CHM-20250115-0001',
        materialGroup: 'Chemicals',
        timestamp: '2025-01-15T10:30:00.000Z',
      });
    });

    it('should include ISO timestamp in the payload', () => {
      emitLotReadyToStore('lot-456', 'RM-20250120-0002', 'Raw Materials');

      const emittedPayload = mockEmit.mock.calls[0][1];
      expect(emittedPayload.timestamp).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should handle empty material group', () => {
      emitLotReadyToStore('lot-789', 'PKG-20250120-0001', '');

      expect(mockEmit).toHaveBeenCalledWith('lot:ready_to_store', {
        lotId: 'lot-789',
        lotNumber: 'PKG-20250120-0001',
        materialGroup: '',
        timestamp: '2025-01-15T10:30:00.000Z',
      });
    });

    it('should emit the event name lot:ready_to_store', () => {
      emitLotReadyToStore('lot-001', 'RM-20250101-0001', 'Raw Materials');

      const eventName = mockEmit.mock.calls[0][0];
      expect(eventName).toBe('lot:ready_to_store');
    });
  });

  describe('sendBreachWhatsAppAlert', () => {
    it('should log a formatted breach alert message', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await sendBreachWhatsAppAlert('Cold Room A', 'zone-001', -2.5);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = consoleSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('[WhatsApp Alert]');
      expect(loggedMessage).toContain('Temperature breach detected');

      consoleSpy.mockRestore();
    });

    it('should include zone name, zone id, and temperature in the alert', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await sendBreachWhatsAppAlert('Cold Room B', 'zone-002', 1.5);

      const loggedMessage = consoleSpy.mock.calls[0][0] as string;
      expect(loggedMessage).toContain('Cold Room B');
      expect(loggedMessage).toContain('zone-002');
      expect(loggedMessage).toContain('1.5');

      consoleSpy.mockRestore();
    });

    it('should return a resolved promise (async void)', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendBreachWhatsAppAlert('Zone X', 'zone-x', 0);
      expect(result).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });
});
