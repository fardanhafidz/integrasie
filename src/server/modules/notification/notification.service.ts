import { randomUUID } from 'crypto';
import { io } from '@server/index';
import { formatBreachAlert } from '../temperature/breachDetector';
import { sendWhatsAppMessage, WhatsAppSendResult } from './whatsappGateway';
import { recordAudit } from '../audit/audit.service';

/**
 * Notification Service
 * Handles real-time notifications via Socket.IO and WhatsApp alerts.
 *
 * Requirement 3.6: Send notification to Warehouse_Operator when lot status changes to 'Ready to Store'
 * within 10 seconds of the status change.
 *
 * Requirement 5.4: Send WhatsApp alert within 30 seconds of breach detection.
 * Requirement 7.4: Retry up to 3 times with 10-second intervals on delivery failure.
 */

export interface LotReadyToStorePayload {
  lotId: string;
  lotNumber: string;
  materialGroup: string;
  timestamp: string;
}

/**
 * Emits a Socket.IO event 'lot:ready_to_store' with lot details.
 * Notifies connected Warehouse_Operator clients that a lot is ready for storage.
 *
 * @param lotId - The UUID of the lot
 * @param lotNumber - The formatted lot number (e.g., "CHM-20250525-0001")
 * @param materialGroup - The material group name for the lot
 */
export function emitLotReadyToStore(
  lotId: string,
  lotNumber: string,
  materialGroup: string
): void {
  const payload: LotReadyToStorePayload = {
    lotId,
    lotNumber,
    materialGroup,
    timestamp: new Date().toISOString(),
  };

  io.emit('lot:ready_to_store', payload);
}

/**
 * Sends a WhatsApp alert for a temperature breach event.
 * Formats the alert message using breachDetector's formatBreachAlert and logs it.
 * Actual Twilio WhatsApp delivery will be implemented in task 10.1.
 *
 * This function must complete within 30 seconds of breach detection to satisfy
 * Requirement 5.4.
 *
 * @param zoneName - The human-readable name of the affected zone
 * @param zoneId - The unique identifier of the affected zone
 * @param temperature - The current temperature reading in degrees Celsius
 *
 * Validates: Requirement 5.4, 5.5
 */
export async function sendBreachWhatsAppAlert(
  zoneName: string,
  zoneId: string,
  temperature: number
): Promise<void> {
  const alertMessage = formatBreachAlert(zoneName, zoneId, temperature);

  // Log the alert (placeholder for Twilio WhatsApp integration in task 10.1)
  console.log(
    `[WhatsApp Alert] Temperature breach detected - sending alert:\n${alertMessage}`
  );
}

/**
 * Result of a retry-based alert delivery attempt.
 */
export interface AlertRetryResult {
  success: boolean;
  failedRecipients: string[];
  attempts: number;
}

/**
 * Utility function to delay execution for a given number of milliseconds.
 * Extracted to allow easy mocking in tests.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a WhatsApp alert message to multiple recipients with retry logic.
 * For each recipient, attempts delivery up to maxRetries times with retryIntervalMs
 * between each attempt. Logs each failed attempt.
 *
 * Requirement 7.4: Retry up to 3 times with 10-second intervals on delivery failure.
 *
 * @param recipients - Array of phone numbers in E.164 format
 * @param message - The alert message body to send
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param retryIntervalMs - Delay between retries in milliseconds (default: 10000)
 * @returns Promise resolving to success status, failed recipients, and total attempts made
 */
export async function sendAlertWithRetry(
  recipients: string[],
  message: string,
  maxRetries: number = 3,
  retryIntervalMs: number = 10000
): Promise<AlertRetryResult> {
  const failedRecipients: string[] = [];
  let totalAttempts = 0;

  for (const recipient of recipients) {
    let delivered = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      totalAttempts++;
      const result: WhatsAppSendResult = await sendWhatsAppMessage(recipient, message);

      if (result.success) {
        delivered = true;
        break;
      }

      // Log the failed attempt
      console.log(
        `[WhatsApp Retry] Delivery failed for ${recipient} (attempt ${attempt}/${maxRetries}): ${result.error}`
      );

      // Wait before retrying, unless this was the last attempt
      if (attempt < maxRetries) {
        await delay(retryIntervalMs);
      }
    }

    if (!delivered) {
      failedRecipients.push(recipient);
    }
  }

  return {
    success: failedRecipients.length === 0,
    failedRecipients,
    attempts: totalAttempts,
  };
}


/**
 * Sends a WhatsApp alert to recipients with retry logic, and if delivery fails
 * after all retries, logs the failure in the audit trail and emits a Socket.IO
 * event for a persistent alert banner on the Factory_Manager dashboard.
 *
 * Requirement 7.4: After 3 retries fail, log a final failure record in the audit
 * trail and display persistent alert banner.
 *
 * @param category - The alert category (e.g., 'temperature_breach', 'slotting_failure')
 * @param recipients - Array of phone numbers in E.164 format
 * @param message - The alert message body to send
 * @returns Promise resolving to the AlertRetryResult
 */
export async function sendAlertAndLogFailure(
  category: string,
  recipients: string[],
  message: string
): Promise<AlertRetryResult> {
  const result = await sendAlertWithRetry(recipients, message);

  if (!result.success) {
    // Log final failure in audit trail
    await recordAudit({
      userId: 'system',
      action: 'whatsapp_delivery_failure',
      entityType: 'notification',
      entityId: randomUUID(),
      oldValue: null,
      newValue: {
        category,
        failedRecipients: result.failedRecipients,
        attempts: result.attempts,
        message: message.length > 200 ? message.substring(0, 200) + '...' : message,
      },
    });

    // Emit Socket.IO event for persistent alert banner on Factory_Manager dashboard
    io.emit('notification:delivery_failure', {
      category,
      failedRecipients: result.failedRecipients,
      attempts: result.attempts,
      timestamp: new Date().toISOString(),
    });
  }

  return result;
}
