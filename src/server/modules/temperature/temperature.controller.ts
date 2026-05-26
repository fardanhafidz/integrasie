/**
 * Temperature Controller
 *
 * Handles HTTP request/response for temperature monitoring endpoints.
 * Delegates data access to Prisma directly for read-only queries.
 *
 * Validates: Requirements 5.2, 5.6
 *
 * Endpoints:
 * - GET /api/temperature/current — Latest reading per cold_chain zone
 * - GET /api/temperature/history/:zoneId — Paginated history for a zone
 * - GET /api/temperature/breaches — Recent breach readings (paginated)
 */

import { Request, Response } from 'express';
import { prisma } from '../../config/database';

/**
 * GET /api/temperature/current
 *
 * Returns the latest temperature reading for each cold_chain zone.
 * Queries all cold_chain warehouse zones and fetches the most recent
 * reading for each.
 *
 * Response: 200 { data: TemperatureReading[] }
 */
export async function getCurrentHandler(req: Request, res: Response): Promise<void> {
  try {
    // Get all cold_chain zones
    const coldChainZones = await prisma.warehouseZone.findMany({
      where: { zone_type: 'cold_chain' },
    });

    if (coldChainZones.length === 0) {
      res.status(200).json({ data: [] });
      return;
    }

    // Get the latest reading for each zone
    const latestReadings = await Promise.all(
      coldChainZones.map(async (zone) => {
        const reading = await prisma.temperatureReading.findFirst({
          where: { zone_id: zone.id },
          orderBy: { recorded_at: 'desc' },
        });

        return {
          zone_id: zone.id,
          zone_name: zone.name,
          block_identifier: zone.block_identifier,
          temperature_celsius: reading ? Number(reading.temperature_celsius) : null,
          is_breach: reading ? reading.is_breach : false,
          recorded_at: reading ? reading.recorded_at : null,
          reading_id: reading ? reading.id : null,
        };
      })
    );

    res.status(200).json({ data: latestReadings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * GET /api/temperature/history/:zoneId
 *
 * Returns paginated temperature reading history for a specific zone.
 *
 * Path params:
 * - zoneId: UUID of the warehouse zone
 *
 * Query params:
 * - limit: number (default 50, max 200)
 * - offset: number (default 0)
 *
 * Response: 200 { data: TemperatureReading[], pagination: { limit, offset, total } }
 */
export async function getHistoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const { zoneId } = req.params;

    // Parse and validate pagination params
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    // Verify zone exists
    const zone = await prisma.warehouseZone.findUnique({
      where: { id: zoneId },
    });

    if (!zone) {
      res.status(404).json({
        error: 'Not found',
        message: 'Zone not found',
      });
      return;
    }

    // Get total count for pagination
    const total = await prisma.temperatureReading.count({
      where: { zone_id: zoneId },
    });

    // Get paginated readings ordered by most recent first
    const readings = await prisma.temperatureReading.findMany({
      where: { zone_id: zoneId },
      orderBy: { recorded_at: 'desc' },
      take: limit,
      skip: offset,
    });

    const data = readings.map((reading) => ({
      id: reading.id,
      zone_id: reading.zone_id,
      temperature_celsius: Number(reading.temperature_celsius),
      is_breach: reading.is_breach,
      recorded_at: reading.recorded_at,
    }));

    res.status(200).json({
      data,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * GET /api/temperature/breaches
 *
 * Returns all temperature readings where is_breach=true, ordered by
 * most recent first, with pagination.
 *
 * Query params:
 * - limit: number (default 50, max 200)
 * - offset: number (default 0)
 *
 * Response: 200 { data: TemperatureReading[], pagination: { limit, offset, total } }
 */
export async function getBreachesHandler(req: Request, res: Response): Promise<void> {
  try {
    // Parse and validate pagination params
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    // Get total count of breaches
    const total = await prisma.temperatureReading.count({
      where: { is_breach: true },
    });

    // Get paginated breach readings with zone info
    const readings = await prisma.temperatureReading.findMany({
      where: { is_breach: true },
      orderBy: { recorded_at: 'desc' },
      take: limit,
      skip: offset,
      include: {
        zone: {
          select: {
            name: true,
            block_identifier: true,
          },
        },
      },
    });

    const data = readings.map((reading) => ({
      id: reading.id,
      zone_id: reading.zone_id,
      zone_name: reading.zone.name,
      block_identifier: reading.zone.block_identifier,
      temperature_celsius: Number(reading.temperature_celsius),
      is_breach: reading.is_breach,
      recorded_at: reading.recorded_at,
    }));

    res.status(200).json({
      data,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}
