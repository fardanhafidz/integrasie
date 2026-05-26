import { prisma } from '@server/config/database';
import type { RackSlot, WarehouseZone, ZoneType } from '@prisma/client';
import { isCompatible } from './hazardMatrix';

/**
 * Lot properties relevant for zone eligibility determination.
 */
export interface LotZoneInput {
  is_temperature_sensitive: boolean;
  is_hazardous: boolean;
}

/**
 * Coordinate information needed to find adjacent slots.
 */
export interface SlotCoordinate {
  zone_id: string;
  row: number;
  level: number;
  position: number;
}

/** Maximum number of slot recommendations to return */
const MAX_RECOMMENDATIONS = 5;

/**
 * Determines which warehouse zones are eligible for storing a given lot
 * based on its material properties.
 *
 * Rules (evaluated in priority order):
 * 1. Temperature-sensitive lots -> cold_chain zones only
 * 2. Hazardous lots (not temperature-sensitive) -> hazardous + standard zones
 * 3. All other lots -> standard zones only
 *
 * @param lot - The lot properties to evaluate
 * @returns Array of eligible WarehouseZone records from the database
 */
export async function getEligibleZones(lot: LotZoneInput): Promise<WarehouseZone[]> {
  const eligibleTypes = getEligibleZoneTypes(lot);

  return prisma.warehouseZone.findMany({
    where: {
      zone_type: {
        in: eligibleTypes,
      },
    },
  });
}

/**
 * Pure function that determines which zone types are eligible for a lot.
 * Exported for unit testing without database dependency.
 *
 * @param lot - The lot properties to evaluate
 * @returns Array of eligible ZoneType values
 */
export function getEligibleZoneTypes(lot: LotZoneInput): ZoneType[] {
  if (lot.is_temperature_sensitive) {
    return ['cold_chain'];
  }

  if (lot.is_hazardous) {
    return ['hazardous', 'standard'];
  }

  return ['standard'];
}

/**
 * Returns directly adjacent slots (left, right, above, below) for a given slot coordinate.
 * Adjacent means same zone, same row, and differs by exactly 1 in either level or position.
 *
 * @param slot - The slot coordinate to find neighbors for
 * @returns Array of adjacent RackSlot records
 */
export async function getAdjacentSlots(slot: SlotCoordinate): Promise<RackSlot[]> {
  return prisma.rackSlot.findMany({
    where: {
      zone_id: slot.zone_id,
      row: slot.row,
      OR: [
        { level: slot.level, position: slot.position - 1 }, // left
        { level: slot.level, position: slot.position + 1 }, // right
        { level: slot.level - 1, position: slot.position }, // below
        { level: slot.level + 1, position: slot.position }, // above
      ],
    },
  });
}

/**
 * Main smart slotting recommendation function.
 *
 * Combines zone filtering, availability check, hazard compatibility,
 * and proximity ranking to recommend 1–5 optimal rack slots for a lot.
 *
 * Algorithm:
 * 1. Fetch lot from DB (verify status is ready_to_store)
 * 2. Get eligible zones based on lot properties (temperature/hazard)
 * 3. Get available slots (status='available') in those zones
 * 4. If lot is hazardous, filter by hazard compatibility with adjacent occupied slots
 * 5. Rank by proximity (prefer slots near other drums from same lot)
 * 6. Return top 1-5 slots
 *
 * @param lotId - The ID of the lot to recommend slots for
 * @returns Array of 1-5 recommended RackSlot records, or empty array if none available
 * @throws Error if lot is not found or not in ready_to_store status
 */
export async function recommendSlots(lotId: string): Promise<RackSlot[]> {
  // 1. Fetch lot from DB and verify status
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
  });

  if (!lot) {
    throw new Error(`Lot not found: ${lotId}`);
  }

  if (lot.status !== 'ready_to_store') {
    throw new Error(
      `Lot ${lotId} is not ready to store (current status: ${lot.status})`
    );
  }

  // 2. Get eligible zones based on lot properties
  const eligibleZones = await getEligibleZones({
    is_temperature_sensitive: lot.is_temperature_sensitive,
    is_hazardous: lot.is_hazardous,
  });

  if (eligibleZones.length === 0) {
    return [];
  }

  const zoneIds = eligibleZones.map((z) => z.id);

  // 3. Get available slots in eligible zones
  const availableSlots = await prisma.rackSlot.findMany({
    where: {
      zone_id: { in: zoneIds },
      status: 'available',
    },
  });

  if (availableSlots.length === 0) {
    return [];
  }

  // 4. If lot is hazardous, filter by hazard compatibility with adjacent occupied slots
  let candidateSlots: RackSlot[];

  if (lot.is_hazardous && lot.hazard_class) {
    candidateSlots = await filterByHazardCompatibility(
      availableSlots,
      lot.hazard_class
    );
  } else {
    candidateSlots = availableSlots;
  }

  if (candidateSlots.length === 0) {
    return [];
  }

  // 5. Rank by proximity (prefer slots near other drums from same lot)
  const rankedSlots = await rankByProximity(candidateSlots, lotId);

  // 6. Return top 1-5 slots
  return rankedSlots.slice(0, MAX_RECOMMENDATIONS);
}

/**
 * Filters available slots by hazard compatibility with adjacent occupied slots.
 *
 * For each candidate slot, checks all adjacent occupied slots. If any adjacent
 * slot contains a hazardous lot with an incompatible hazard class, the candidate
 * is excluded.
 *
 * @param slots - Available slots to filter
 * @param hazardClass - The hazard class of the lot being placed
 * @returns Slots that are compatible with all adjacent occupied lots
 */
async function filterByHazardCompatibility(
  slots: RackSlot[],
  hazardClass: string
): Promise<RackSlot[]> {
  const compatible: RackSlot[] = [];

  for (const slot of slots) {
    const adjacentSlots = await getAdjacentSlots({
      zone_id: slot.zone_id,
      row: slot.row,
      level: slot.level,
      position: slot.position,
    });

    const occupiedAdjacent = adjacentSlots.filter(
      (s) => s.status === 'occupied' && s.current_lot_id !== null
    );

    // If no occupied adjacent slots, it's safe
    if (occupiedAdjacent.length === 0) {
      compatible.push(slot);
      continue;
    }

    // Check compatibility with each occupied adjacent slot's lot
    const lotIds = occupiedAdjacent
      .map((s) => s.current_lot_id)
      .filter((id): id is string => id !== null);

    const adjacentLots = await prisma.lot.findMany({
      where: { id: { in: lotIds } },
    });

    let isSlotCompatible = true;

    for (const adjLot of adjacentLots) {
      // Non-hazardous adjacent lots are always compatible
      if (!adjLot.is_hazardous || !adjLot.hazard_class) {
        continue;
      }

      const canCoexist = await isCompatible(hazardClass, adjLot.hazard_class);
      if (!canCoexist) {
        isSlotCompatible = false;
        break;
      }
    }

    if (isSlotCompatible) {
      compatible.push(slot);
    }
  }

  return compatible;
}

/**
 * Ranks candidate slots by proximity to other drums from the same lot.
 *
 * Slots adjacent to existing drums from the same lot are ranked higher,
 * encouraging grouping of drums from the same lot together.
 * Slots with no proximity advantage are ranked by zone and position
 * for consistent ordering.
 *
 * @param slots - Candidate slots to rank
 * @param lotId - The lot ID to check proximity against
 * @returns Slots sorted by proximity score (best first)
 */
async function rankByProximity(
  slots: RackSlot[],
  lotId: string
): Promise<RackSlot[]> {
  // Find existing slots occupied by drums from the same lot
  const existingLotSlots = await prisma.rackSlot.findMany({
    where: {
      current_lot_id: lotId,
      status: 'occupied',
    },
  });

  // If no existing placements, return slots in a stable order (by zone, row, level, position)
  if (existingLotSlots.length === 0) {
    return slots.sort((a, b) => {
      if (a.zone_id !== b.zone_id) return a.zone_id.localeCompare(b.zone_id);
      if (a.row !== b.row) return a.row - b.row;
      if (a.level !== b.level) return a.level - b.level;
      return a.position - b.position;
    });
  }

  // Score each candidate slot by proximity to existing lot slots
  // Lower distance = higher priority
  const scored = slots.map((slot) => {
    let minDistance = Infinity;

    for (const existing of existingLotSlots) {
      // Only consider slots in the same zone and row for proximity
      if (slot.zone_id === existing.zone_id && slot.row === existing.row) {
        const distance =
          Math.abs(slot.level - existing.level) +
          Math.abs(slot.position - existing.position);
        if (distance < minDistance) {
          minDistance = distance;
        }
      }
    }

    return { slot, distance: minDistance };
  });

  // Sort by distance (closest first), then by position for stable ordering
  scored.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.slot.zone_id !== b.slot.zone_id)
      return a.slot.zone_id.localeCompare(b.slot.zone_id);
    if (a.slot.row !== b.slot.row) return a.slot.row - b.slot.row;
    if (a.slot.level !== b.slot.level) return a.slot.level - b.slot.level;
    return a.slot.position - b.slot.position;
  });

  return scored.map((s) => s.slot);
}
