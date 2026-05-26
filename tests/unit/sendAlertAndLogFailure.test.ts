import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Socket.IO server
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

// Mock the WhatsApp gateway
const mockSendWhatsAppMessage = vi.hoisted(() => vi.fn());
vi.mock('@server/modules/notification/whatsappGateway', () => ({
  sendWhatsAppMessage: mockSendWhatsAppMessage,
}));

// Mock the audit service
const mockRecordAudit = vi.hoisted(() => vi.fn());
vi.mock('@server/modules/audit/audit.service', () => ({
  recordAudit: mockRecordAudit,
}));

// Mock crypto.randomUUID
const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
vi.mock('crypto', () => ({
  randomUUID: () => mockUUID,
}));

import { sendAlertAndLogFailure } from '@server/modules/notification/notification.service';

describe('sendAlertAndLogFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRecordAudit.mockResolvedValue({
      id: mockUUID,
      user_id: 'system',
      action: 'whatsapp_delivery_failure',
      entity_type: 'notification',
      entity_id: mockUUID,
      old_value: null,
      new_value: {},
      timestamp: new Date(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not log to audit trail or emit event when delivery succeeds', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: true, messageId: 'msg-001' });

    const result = await sendAlertAndLogFailure(
      'temperature_breach',
      ['+6281234567890'],
      'Alert message'
    );

    expect(result.success).toBe(true);
    expect(result.failedRecipients).toEqual([]);
    expect(mockRecordAudit).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalledWith('notification:delivery_failure', expect.anything());
  });

  it('should log to audit trail when all retries fail', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Service down' });

    const promise = sendAlertAndLogFailure(
      'temperature_breach',
      ['+6281234567890'],
      'Alert message'
    );

    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);

    const result = await promise;

    expect(result.success).toBe(false);
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith({
      userId: 'system',
      action: 'whatsapp_delivery_failure',
      entityType: 'notification',
      entityId: mockUUID,
      oldValue: null,
      newValue: {
        category: 'temperature_breach',
        failedRecipients: ['+6281234567890'],
        attempts: 3,
        message: 'Alert message',
      },
    });
  });

  it('should emit Socket.IO event notification:delivery_failure when retries fail', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Service down' });

    const promise = sendAlertAndLogFailure(
      'slotting_failure',
      ['+6281234567890'],
      'No slot available'
    );

    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);

    await promise;

    expect(mockEmit).toHaveBeenCalledWith('notification:delivery_failure', {
      category: 'slotting_failure',
      failedRecipients: ['+6281234567890'],
      attempts: 3,
      timestamp: expect.any(String),
    });
  });

  it('should truncate long messages in audit trail to 200 chars', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Error' });
    const longMessage = 'A'.repeat(300);

    const promise = sendAlertAndLogFailure(
      'temperature_breach',
      ['+6281234567890'],
      longMessage
    );

    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);

    await promise;

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          message: 'A'.repeat(200) + '...',
        }),
      })
    );
  });

  it('should not truncate messages 200 chars or shorter', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Error' });
    const shortMessage = 'Short alert message';

    const promise = sendAlertAndLogFailure(
      'temperature_breach',
      ['+6281234567890'],
      shortMessage
    );

    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);

    await promise;

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          message: shortMessage,
        }),
      })
    );
  });

  it('should include all failed recipients in audit and event when multiple fail', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Error' });

    const promise = sendAlertAndLogFailure(
      'temperature_breach',
      ['+6281234567890', '+6289876543210'],
      'Alert message'
    );

    // Advance timers for all retries across both recipients
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);

    await promise;

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          failedRecipients: ['+6281234567890', '+6289876543210'],
          attempts: 6,
        }),
      })
    );

    expect(mockEmit).toHaveBeenCalledWith('notification:delivery_failure', expect.objectContaining({
      failedRecipients: ['+6281234567890', '+6289876543210'],
      attempts: 6,
    }));
  });

  it('should log failure when some recipients succeed and others fail', async () => {
    // First recipient succeeds, second fails all retries
    mockSendWhatsAppMessage
      .mockResolvedValueOnce({ success: true, messageId: 'msg-ok' })
      .mockResolvedValueOnce({ success: false, error: 'Fail 1' })
      .mockResolvedValueOnce({ success: false, error: 'Fail 2' })
      .mockResolvedValueOnce({ success: false, error: 'Fail 3' });

    const promise = sendAlertAndLogFailure(
      'temperature_breach',
      ['+6281234567890', '+6289876543210'],
      'Alert message'
    );

    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);

    await promise;

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          failedRecipients: ['+6289876543210'],
          attempts: 4,
        }),
      })
    );

    expect(mockEmit).toHaveBeenCalledWith('notification:delivery_failure', expect.objectContaining({
      failedRecipients: ['+6289876543210'],
    }));
  });

  it('should return the AlertRetryResult from sendAlertWithRetry', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Error' });

    const promise = sendAlertAndLogFailure(
      'temperature_breach',
      ['+6281234567890'],
      'Alert message'
    );

    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);

    const result = await promise;

    expect(result).toEqual({
      success: false,
      failedRecipients: ['+6281234567890'],
      attempts: 3,
    });
  });
});
