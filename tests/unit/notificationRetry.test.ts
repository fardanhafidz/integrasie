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

import { sendAlertWithRetry } from '@server/modules/notification/notification.service';

describe('sendAlertWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed on first attempt when delivery succeeds immediately', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: true, messageId: 'msg-001' });

    const promise = sendAlertWithRetry(
      ['+6281234567890'],
      'Test alert message',
      3,
      10
    );

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.failedRecipients).toEqual([]);
    expect(result.attempts).toBe(1);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith('+6281234567890', 'Test alert message');
  });

  it('should retry up to 3 times on delivery failure and report failure', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Network error' });

    const promise = sendAlertWithRetry(
      ['+6281234567890'],
      'Test alert message',
      3,
      10
    );

    // Advance timers for the delays between retries
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.failedRecipients).toEqual(['+6281234567890']);
    expect(result.attempts).toBe(3);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(3);
  });

  it('should succeed on second attempt after first failure', async () => {
    mockSendWhatsAppMessage
      .mockResolvedValueOnce({ success: false, error: 'Temporary error' })
      .mockResolvedValueOnce({ success: true, messageId: 'msg-002' });

    const promise = sendAlertWithRetry(
      ['+6281234567890'],
      'Test alert message',
      3,
      10
    );

    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.failedRecipients).toEqual([]);
    expect(result.attempts).toBe(2);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(2);
  });

  it('should succeed on third attempt after two failures', async () => {
    mockSendWhatsAppMessage
      .mockResolvedValueOnce({ success: false, error: 'Error 1' })
      .mockResolvedValueOnce({ success: false, error: 'Error 2' })
      .mockResolvedValueOnce({ success: true, messageId: 'msg-003' });

    const promise = sendAlertWithRetry(
      ['+6281234567890'],
      'Test alert message',
      3,
      10
    );

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.failedRecipients).toEqual([]);
    expect(result.attempts).toBe(3);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(3);
  });

  it('should handle multiple recipients independently', async () => {
    // First recipient succeeds on first try, second fails all 3 attempts
    mockSendWhatsAppMessage
      .mockResolvedValueOnce({ success: true, messageId: 'msg-r1' }) // recipient 1, attempt 1
      .mockResolvedValueOnce({ success: false, error: 'Fail 1' })    // recipient 2, attempt 1
      .mockResolvedValueOnce({ success: false, error: 'Fail 2' })    // recipient 2, attempt 2
      .mockResolvedValueOnce({ success: false, error: 'Fail 3' });   // recipient 2, attempt 3

    const promise = sendAlertWithRetry(
      ['+6281234567890', '+6289876543210'],
      'Test alert message',
      3,
      10
    );

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.failedRecipients).toEqual(['+6289876543210']);
    expect(result.attempts).toBe(4); // 1 for first recipient + 3 for second
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(4);
  });

  it('should handle all recipients succeeding', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: true, messageId: 'msg-ok' });

    const promise = sendAlertWithRetry(
      ['+6281234567890', '+6289876543210', '+6281111111111'],
      'Test alert message',
      3,
      10
    );

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.failedRecipients).toEqual([]);
    expect(result.attempts).toBe(3); // 1 attempt per recipient
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(3);
  });

  it('should handle all recipients failing', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Service down' });

    const promise = sendAlertWithRetry(
      ['+6281234567890', '+6289876543210'],
      'Test alert message',
      3,
      10
    );

    // Advance timers enough for all retries across all recipients
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.failedRecipients).toEqual(['+6281234567890', '+6289876543210']);
    expect(result.attempts).toBe(6); // 3 attempts per recipient × 2 recipients
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(6);
  });

  it('should log each failed attempt', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'API timeout' });

    const promise = sendAlertWithRetry(
      ['+6281234567890'],
      'Test alert message',
      3,
      10
    );

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    await promise;

    // Should log 3 failed attempts
    const retryCalls = consoleSpy.mock.calls.filter(
      (call) => (call[0] as string).includes('[WhatsApp Retry]')
    );
    expect(retryCalls).toHaveLength(3);
    expect(retryCalls[0][0]).toContain('attempt 1/3');
    expect(retryCalls[1][0]).toContain('attempt 2/3');
    expect(retryCalls[2][0]).toContain('attempt 3/3');
    expect(retryCalls[0][0]).toContain('API timeout');

    consoleSpy.mockRestore();
  });

  it('should use default maxRetries of 3 when not specified', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Error' });

    const promise = sendAlertWithRetry(
      ['+6281234567890'],
      'Test alert message'
    );

    // Default retryIntervalMs is 10000ms, advance timers accordingly
    await vi.advanceTimersByTimeAsync(10000);
    await vi.advanceTimersByTimeAsync(10000);

    const result = await promise;

    expect(result.attempts).toBe(3);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(3);
  });

  it('should respect custom maxRetries parameter', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'Error' });

    const promise = sendAlertWithRetry(
      ['+6281234567890'],
      'Test alert message',
      5,
      10
    );

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;

    expect(result.attempts).toBe(5);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(5);
  });

  it('should handle empty recipients array', async () => {
    const result = await sendAlertWithRetry(
      [],
      'Test alert message',
      3,
      10
    );

    expect(result.success).toBe(true);
    expect(result.failedRecipients).toEqual([]);
    expect(result.attempts).toBe(0);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('should not log retry messages when delivery succeeds on first attempt', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockSendWhatsAppMessage.mockResolvedValue({ success: true, messageId: 'msg-ok' });

    const result = await sendAlertWithRetry(
      ['+6281234567890'],
      'Test alert message',
      3,
      10
    );

    const retryCalls = consoleSpy.mock.calls.filter(
      (call) => (call[0] as string).includes('[WhatsApp Retry]')
    );
    expect(retryCalls).toHaveLength(0);
    expect(result.success).toBe(true);

    consoleSpy.mockRestore();
  });
});
