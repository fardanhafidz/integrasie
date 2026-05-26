import { formatBreachAlert } from '../temperature/breachDetector';

/**
 * Maximum allowed length for any alert message.
 */
export const MAX_ALERT_LENGTH = 1000;

/**
 * Severity levels for critical alerts.
 */
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

/**
 * Parameters for formatting a general critical alert message.
 */
export interface CriticalAlertParams {
  severity: AlertSeverity;
  eventType: string;
  description: string;
  affectedArea: string;
  currentReading?: string;
  safeThreshold?: string;
  recommendedAction: string;
}

/**
 * Formats a structured critical alert message with severity, event description,
 * affected area, current reading, safe threshold, and recommended action.
 *
 * The total message length is guaranteed to be ≤1000 characters.
 * If the message exceeds 1000 characters, it is truncated.
 *
 * @param params - The alert parameters
 * @returns A formatted alert message string ≤1000 characters
 *
 * Validates: Requirement 7.2
 */
export function formatCriticalAlert(params: CriticalAlertParams): string {
  const {
    severity,
    eventType,
    description,
    affectedArea,
    currentReading,
    safeThreshold,
    recommendedAction,
  } = params;

  const lines: string[] = [
    `⚠️ [${severity}] ${eventType}`,
    `Description: ${description}`,
    `Affected Area: ${affectedArea}`,
  ];

  if (currentReading !== undefined) {
    lines.push(`Current Reading: ${currentReading}`);
  }

  if (safeThreshold !== undefined) {
    lines.push(`Safe Threshold: ${safeThreshold}`);
  }

  lines.push(`Recommended Action: ${recommendedAction}`);

  const message = lines.join('\n');

  if (message.length > MAX_ALERT_LENGTH) {
    return message.slice(0, MAX_ALERT_LENGTH);
  }

  return message;
}

/**
 * Formats a temperature breach alert message by delegating to the existing
 * formatBreachAlert function in breachDetector.
 *
 * @param zoneName - The human-readable name of the affected zone
 * @param zoneId - The unique identifier of the affected zone
 * @param temperature - The current temperature reading in degrees Celsius
 * @returns A formatted alert message string ≤1000 characters
 *
 * Validates: Requirements 5.4, 5.5
 */
export function formatTemperatureBreachAlert(
  zoneName: string,
  zoneId: string,
  temperature: number
): string {
  return formatBreachAlert(zoneName, zoneId, temperature);
}

/**
 * Formats a slotting failure alert message for the "no available slot" scenario.
 *
 * @param lotId - The UUID of the lot that could not be slotted
 * @param lotNumber - The formatted lot number (e.g., "CHM-20250525-0001")
 * @param reason - The reason no slot was available
 * @returns A formatted alert message string ≤1000 characters
 *
 * Validates: Requirement 4.4, 7.2
 */
export function formatSlottingFailureAlert(
  lotId: string,
  lotNumber: string,
  reason: string
): string {
  return formatCriticalAlert({
    severity: 'HIGH',
    eventType: 'SLOTTING FAILURE',
    description: `No available slot found for lot ${lotNumber}`,
    affectedArea: `Lot ID: ${lotId}`,
    recommendedAction: `Manual intervention required. Reason: ${reason}`,
  });
}

/**
 * Formats a delivery failure alert message for WhatsApp delivery failure
 * after all retry attempts are exhausted.
 *
 * @param category - The alert category that failed to deliver
 * @param failedRecipients - Array of phone numbers that failed to receive the message
 * @param attempts - The number of delivery attempts made
 * @returns A formatted alert message string ≤1000 characters
 *
 * Validates: Requirement 7.4
 */
export function formatDeliveryFailureAlert(
  category: string,
  failedRecipients: string[],
  attempts: number
): string {
  const recipientList = failedRecipients.join(', ');

  return formatCriticalAlert({
    severity: 'CRITICAL',
    eventType: 'WHATSAPP DELIVERY FAILURE',
    description: `Failed to deliver alert for category "${category}" after ${attempts} attempts`,
    affectedArea: `Recipients: ${recipientList}`,
    recommendedAction:
      'Check WhatsApp gateway connectivity and recipient phone numbers. Verify Twilio API credentials.',
  });
}
