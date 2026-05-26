import { prisma } from '@server/config/database';
import { io } from '@server/index';
import { SAFE_TEMP_LIMIT } from './breachDetector';
import { sendBreachWhatsAppAlert } from '../notification/notification.service';

export interface TemperatureReadingResult {
  id: string;
  zone_id: string;
  temperature_celsius: number;
  is_breach: boolean;
  recorded_at: Date;
}

export interface TemperatureBreachEvent {
  zoneId: string;
  zoneName: string;
  temperature: number;
  safeLimit: number;
  timestamp: Date;
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Simulates reading a temperature sensor for a cold-chain zone.
 * Returns a random temperature between -25°C and 0°C.
 * In production, this would integrate with IoT sensors.
 */
function simulateSensorReading(): number {
  // Random temperature between -25 and 0
  const temp = Math.random() * 25 * -1;
  // Round to 2 decimal places
  return Math.round(temp * 100) / 100;
}

/**
 * Polls temperature sensors for all cold_chain warehouse zones.
 * Creates a TemperatureReading record for each zone.
 * Emits WebSocket events for real-time dashboard updates.
 * Returns the array of created readings.
 */
export async function pollSensors(): Promise<TemperatureReadingResult[]> {
  // Get all cold_chain zones
  const coldChainZones = await prisma.warehouseZone.findMany({
    where: {
      zone_type: 'cold_chain',
    },
  });

  if (coldChainZones.length === 0) {
    return [];
  }

  const readings: TemperatureReadingResult[] = [];

  for (const zone of coldChainZones) {
    const temperature = simulateSensorReading();
    const isBreach = temperature > SAFE_TEMP_LIMIT;

    const reading = await prisma.temperatureReading.create({
      data: {
        zone_id: zone.id,
        temperature_celsius: temperature,
        is_breach: isBreach,
        recorded_at: new Date(),
      },
    });

    readings.push({
      id: reading.id,
      zone_id: reading.zone_id,
      temperature_celsius: Number(reading.temperature_celsius),
      is_breach: reading.is_breach,
      recorded_at: reading.recorded_at,
    });
  }

  // Emit real-time temperature update to all connected dashboards
  emitTemperatureEvents(readings, coldChainZones);

  return readings;
}

/**
 * Emits WebSocket events after polling sensors.
 * - Always emits 'temperature:update' with all readings.
 * - If any reading is a breach, also emits 'temperature:breach' for each breach
 *   and triggers a WhatsApp alert via the notification service.
 */
function emitTemperatureEvents(
  readings: TemperatureReadingResult[],
  zones: { id: string; name: string }[]
): void {
  // Build a zone name lookup map
  const zoneNameMap = new Map(zones.map((z) => [z.id, z.name]));

  // Emit temperature:update with all readings
  io.emit('temperature:update', { readings });

  // Emit temperature:breach for each breach reading and send WhatsApp alert
  const breachReadings = readings.filter((r) => r.is_breach);
  for (const breach of breachReadings) {
    const zoneName = zoneNameMap.get(breach.zone_id) || 'Unknown Zone';

    const breachEvent: TemperatureBreachEvent = {
      zoneId: breach.zone_id,
      zoneName,
      temperature: breach.temperature_celsius,
      safeLimit: SAFE_TEMP_LIMIT,
      timestamp: breach.recorded_at,
    };
    io.emit('temperature:breach', breachEvent);

    // Trigger WhatsApp alert for the breach (Requirement 5.4)
    sendBreachWhatsAppAlert(zoneName, breach.zone_id, breach.temperature_celsius).catch(
      (err) => {
        console.error('Failed to send breach WhatsApp alert:', err);
      }
    );
  }
}

/**
 * Starts the temperature polling background worker.
 * Polls sensors at the specified interval (default: 60000ms = 60 seconds).
 *
 * @param intervalMs - Polling interval in milliseconds (default: 60000)
 */
export function startTemperaturePolling(intervalMs: number = 60000): void {
  if (pollingInterval !== null) {
    // Already running, stop first
    stopTemperaturePolling();
  }

  console.log(`🌡️  Temperature polling started (interval: ${intervalMs}ms)`);

  // Run immediately on start, then at interval
  pollSensors().catch((err) => {
    console.error('Temperature polling error:', err);
  });

  pollingInterval = setInterval(() => {
    pollSensors().catch((err) => {
      console.error('Temperature polling error:', err);
    });
  }, intervalMs);
}

/**
 * Stops the temperature polling background worker.
 */
export function stopTemperaturePolling(): void {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('🌡️  Temperature polling stopped');
  }
}

/**
 * Returns whether the polling worker is currently active.
 */
export function isPollingActive(): boolean {
  return pollingInterval !== null;
}
