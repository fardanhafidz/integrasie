import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendWhatsAppMessage } from '@server/modules/notification/whatsappGateway';
import { env } from '@server/config/env';

// Mock the env module
vi.mock('@server/config/env', () => ({
  env: {
    TWILIO_ACCOUNT_SID: 'AC_test_account_sid',
    TWILIO_AUTH_TOKEN: 'test_auth_token',
    TWILIO_WHATSAPP_FROM: '+14155238886',
  },
}));

// Cast to mutable for test manipulation
const mutableEnv = env as Record<string, string>;

describe('WhatsApp Gateway - sendWhatsAppMessage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should send a WhatsApp message successfully and return messageId', async () => {
    const mockResponse = {
      sid: 'SM_test_message_id_123',
      status: 'queued',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await sendWhatsAppMessage('+6281234567890', 'Test alert message');

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('SM_test_message_id_123');
    expect(result.error).toBeUndefined();

    // Verify fetch was called with correct parameters
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC_test_account_sid/Messages.json'
    );
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    // Verify Basic auth header
    const expectedCredentials = Buffer.from('AC_test_account_sid:test_auth_token').toString('base64');
    expect(options.headers['Authorization']).toBe(`Basic ${expectedCredentials}`);

    // Verify body contains correct parameters
    const bodyParams = new URLSearchParams(options.body);
    expect(bodyParams.get('From')).toBe('whatsapp:+14155238886');
    expect(bodyParams.get('To')).toBe('whatsapp:+6281234567890');
    expect(bodyParams.get('Body')).toBe('Test alert message');
  });

  it('should return error when Twilio API returns a non-OK response', async () => {
    const mockErrorResponse = {
      code: 21211,
      message: "The 'To' number is not a valid phone number.",
      status: 400,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve(mockErrorResponse),
    });

    const result = await sendWhatsAppMessage('+invalid', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe("The 'To' number is not a valid phone number.");
    expect(result.messageId).toBeUndefined();
  });

  it('should return error with status text when Twilio response has no message field', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    });

    const result = await sendWhatsAppMessage('+6281234567890', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Twilio API error: 500 Internal Server Error');
    expect(result.messageId).toBeUndefined();
  });

  it('should return error when fetch throws a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'));

    const result = await sendWhatsAppMessage('+6281234567890', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to send WhatsApp message: Network connection failed');
    expect(result.messageId).toBeUndefined();
  });

  it('should return error when fetch throws a non-Error object', async () => {
    global.fetch = vi.fn().mockRejectedValue('unexpected string error');

    const result = await sendWhatsAppMessage('+6281234567890', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to send WhatsApp message: Unknown error occurred');
    expect(result.messageId).toBeUndefined();
  });

  it('should handle messages with special characters', async () => {
    const specialMessage = '🚨 ALERT: Temperature breach in Zone A! Current: -2.5°C > Limit: -4.0°C';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ sid: 'SM_special_chars_123' }),
    });

    const result = await sendWhatsAppMessage('+6281234567890', specialMessage);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('SM_special_chars_123');

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const bodyParams = new URLSearchParams(options.body);
    expect(bodyParams.get('Body')).toBe(specialMessage);
  });
});

describe('WhatsApp Gateway - missing credentials', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Ensure fetch is not called when credentials are missing
    global.fetch = vi.fn();
  });

  afterEach(() => {
    // Restore env values
    mutableEnv.TWILIO_ACCOUNT_SID = 'AC_test_account_sid';
    mutableEnv.TWILIO_AUTH_TOKEN = 'test_auth_token';
    mutableEnv.TWILIO_WHATSAPP_FROM = '+14155238886';
    global.fetch = originalFetch;
  });

  it('should return error when TWILIO_ACCOUNT_SID is empty', async () => {
    mutableEnv.TWILIO_ACCOUNT_SID = '';

    const result = await sendWhatsAppMessage('+6281234567890', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Twilio credentials not configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return error when TWILIO_AUTH_TOKEN is empty', async () => {
    mutableEnv.TWILIO_AUTH_TOKEN = '';

    const result = await sendWhatsAppMessage('+6281234567890', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Twilio credentials not configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should return error when TWILIO_WHATSAPP_FROM is empty', async () => {
    mutableEnv.TWILIO_WHATSAPP_FROM = '';

    const result = await sendWhatsAppMessage('+6281234567890', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Twilio credentials not configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
