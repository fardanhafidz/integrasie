import { prisma } from '../../config/database';

/**
 * Safe temperature limit for cold-chain zones.
 * Temperatures above this value constitute a breach.
 */
export const SAFE_TEMP_LIMIT = -4.0;

/**
 * Default maximum gap in milliseconds before a sensor is considered failed.
 * 120 seconds = 2 consecutive polling intervals at 60s each.
 */
export const DEFAULT_SENSOR_FAILURE_GAP_MS = 120_000;

/**
 * Number of consecutive safe readings required to resolve a breach.
 */
export const BREACH_RESOLUTION_COUNT = 3;

/**
 * Checks whether a temperature reading constitutes a breach.
 * A breach occurs when the temperature is strictly greater than -4.0°C.
 *
 * @param temperatureCelsius - The temperature reading in degrees Celsius
 * @returns true if the temperature exceeds the safe limit (breach), false otherwise
 *
 * Validates: Requirement 5.3
 */
export function checkBreach(temperatureCelsius: number): boolean {
  return temperatureCelsius > SAFE_TEMP_LIMIT;
}

/**
 * Determines whether a temperature breach has been resolved for a given zone.
 * A breach is resolved after 3 consecutive readings at or below -4.0°C.
 *
 * @param zoneId - The warehouse zone identifier
 * @returns true if the last 3 readings are all at or below the safe limit
 *
 * Validates: Requirement 5.6
 */
export async function isBreachResolved(zoneId: string): Promise<boolean> {
  const recentReadings = await prisma.temperatureReading.findMany({
    where: { zone_id: zoneId },
    orderBy: { recorded_at: 'desc' },
    take: BREACH_RESOLUTION_COUNT,
  });

  // Need at least 3 readings to confirm resolution
  if (recentReadings.length < BREACH_RESOLUTION_COUNT) {
    return false;
  }

  // All 3 most recent readings must be at or below the safe limit
  return recentReadings.every(
    (reading) => Number(reading.temperature_celsius) <= SAFE_TEMP_LIMIT
  );
}

/**
 * Detects whether a sensor has failed for a given zone by checking
 * if no data has been received for more than the specified gap.
 *
 * @param zoneId - The warehouse zone identifier
 * @param maxGapMs - Maximum allowed gap in milliseconds (default: 120000ms = 120s)
 * @returns true if no data has been received within the allowed gap
 *
 * Validates: Requirement 5.7
 */
export async function detectSensorFailure(
  zoneId: string,
  maxGapMs: number = DEFAULT_SENSOR_FAILURE_GAP_MS
): Promise<boolean> {
  const latestReading = await prisma.temperatureReading.findFirst({
    where: { zone_id: zoneId },
    orderBy: { recorded_at: 'desc' },
  });

  // If no readings exist at all, consider it a sensor failure
  if (!latestReading) {
    return true;
  }

  const now = Date.now();
  const lastReadingTime = latestReading.recorded_at.getTime();
  const gap = now - lastReadingTime;

  return gap > maxGapMs;
}

/**
 * Maximum allowed length for a breach alert message.
 */
export const MAX_ALERT_LENGTH = 1000;

/**
 * Formats a temperature breach alert message including the affected zone identifier,
 * current temperature reading, and safe temperature limit.
 *
 * The message includes severity, zone info, current reading, threshold, and recommended action.
 * The total message length is guaranteed to be ≤1000 characters.
 *
 * @param zoneName - The human-readable name of the affected zone
 * @param zoneId - The unique identifier of the affected zone
 * @param currentTemp - The current temperature reading in degrees Celsius
 * @returns A formatted alert message string ≤1000 characters
 *
 * Validates: Requirements 5.4, 5.5
 */
export function formatBreachAlert(
  zoneName: string,
  zoneId: string,
  currentTemp: number
): string {
  const message = [
    '🚨 TEMPERATURE BREACH',
    `Zone: ${zoneName} (${zoneId})`,
    `Current: ${currentTemp}°C`,
    `Safe Limit: ${SAFE_TEMP_LIMIT.toFixed(1)}°C`,
    'Action Required: Investigate immediately',
  ].join('\n');

  // Ensure message does not exceed 1000 characters
  if (message.length > MAX_ALERT_LENGTH) {
    return message.slice(0, MAX_ALERT_LENGTH);
  }

  return message;
}
