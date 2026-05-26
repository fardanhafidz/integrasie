import { env } from '@server/config/env';

/**
 * WhatsApp Gateway Service
 * Integrates with Twilio WhatsApp API to send critical alert messages.
 *
 * Requirement 7.1: Integrate with WhatsApp Gateway API (Twilio) for critical alerts.
 */

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a WhatsApp message via the Twilio Messages API.
 *
 * Uses native fetch (Node 18+) to POST to:
 *   https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
 *
 * Reads credentials from environment:
 *   - TWILIO_ACCOUNT_SID
 *   - TWILIO_AUTH_TOKEN
 *   - TWILIO_WHATSAPP_FROM (the sender WhatsApp number)
 *
 * @param to - Recipient phone number in E.164 format (e.g., "+6281234567890")
 * @param message - The message body to send (max 1600 chars for WhatsApp)
 * @returns Promise resolving to success/failure with messageId or error
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<WhatsAppSendResult> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const fromNumber = env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    return {
      success: false,
      error: 'Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM environment variables.',
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const body = new URLSearchParams({
    From: `whatsapp:${fromNumber}`,
    To: `whatsapp:${to}`,
    Body: message,
  });

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (response.ok) {
      return {
        success: true,
        messageId: data.sid,
      };
    }

    return {
      success: false,
      error: data.message || `Twilio API error: ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: `Failed to send WhatsApp message: ${errorMessage}`,
    };
  }
}
