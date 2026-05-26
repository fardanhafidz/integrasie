/**
 * Slotting Service
 *
 * Implements the smart slotting recommendation logic by combining:
 * - Zone eligibility (temperature-sensitive → cold_chain, hazardous → hazardous/standard)
 * - Slot availability filtering
 * - Hazard segregation compatibility checking
 * - Proximity ranking (group drums from same lot together)
 *
 * Also handles slot assignment confirmation (task 6.6):
 * - Verify lot exists and is ready_to_store
 * - Verify slot exists and is available
 * - In a transaction: update slot status to 'occupied', set current_lot_id
 * - Create audit trail record
 *
 * Also handles override placement with mandatory justification (task 6.7):
 * - Validate justification >= 10 chars
 * - Verify lot exists and is ready_to_store
 * - Verify slot exists and is available
 * - In a transaction: update slot status to 'occupied', set current_lot_id
 * - Record override justification in audit trail
 * - Emit Socket.IO event 'slot:override' to notify Factory_Manager
 *
 * Returns 1–5 valid slot recommendations for a given lot.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6, 4.7
 */

import { prisma } from '@server/config/database';
import { getEligibleZones, getAdjacentSlots } from './slottingEngine';
import { isCompatible } from './hazardMatrix';
import { io } from '@server/index';
import type { RackSlot } from '@prisma/client';

export interface SlotRecommendation {
  id: string;
  coordinate: string;
  zone_id: string;
  zone_name: string;
  zone_type: string;
  row: number;
  level: number;
  position: number;
}

/**
 * Recommends optimal rack slots for a given lot based on material properties,
 * hazard segregation, and cold-chain constraints.
 *
 * @param lotId - The lot ID to recommend slots for
 * @returns Array of 1–5 valid slot recommendations
 * @throws Error if lot not found or lot not in ready_to_store status
 */
export async function recommendSlots(lotId: string): Promise<SlotRecommendation[]> {
  // 1. Fetch the lot
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
  });

  if (!lot) {
    throw new Error(`Lot not found: ${lotId}`);
  }

  // 2. Verify lot is in ready_to_store status
  if (lot.status !== 'ready_to_store') {
    throw new Error(`Lot is not ready to store. Current status: ${lot.status}`);
  }

  // 3. Determine eligible zones based on lot properties
  const eligibleZones = await getEligibleZones({
    is_temperature_sensitive: lot.is_temperature_sensitive,
    is_hazardous: lot.is_hazardous,
  });

  if (eligibleZones.length === 0) {
    return [];
  }

  const zoneIds = eligibleZones.map((z) => z.id);

  // 4. Get available slots in eligible zones
  const availableSlots = await prisma.rackSlot.findMany({
    where: {
      zone_id: { in: zoneIds },
      status: 'available',
    },
    include: {
      zone: true,
    },
  });

  if (availableSlots.length === 0) {
    return [];
  }

  // 5. If hazardous, filter by segregation compatibility
  let filteredSlots = availableSlots;

  if (lot.is_hazardous && lot.hazard_class) {
    filteredSlots = [];

    for (const slot of availableSlots) {
      const adjacent = await getAdjacentSlots({
        zone_id: slot.zone_id,
        row: slot.row,
        level: slot.level,
        position: slot.position,
      });

      const occupiedAdjacent = adjacent.filter((s) => s.status === 'occupied');

      let allCompatible = true;

      for (const adjSlot of occupiedAdjacent) {
        if (!adjSlot.current_lot_id) continue;

        const adjLot = await prisma.lot.findUnique({
          where: { id: adjSlot.current_lot_id },
        });

        if (!adjLot || !adjLot.is_hazardous || !adjLot.hazard_class) continue;

        const compatible = await isCompatible(lot.hazard_class, adjLot.hazard_class);
        if (!compatible) {
          allCompatible = false;
          break;
        }
      }

      if (allCompatible) {
        filteredSlots.push(slot);
      }
    }
  }

  // 6. Rank by proximity (prefer slots close together for grouping)
  // Sort by zone, row, level, position for proximity grouping
  filteredSlots.sort((a, b) => {
    if (a.zone_id !== b.zone_id) return a.zone_id.localeCompare(b.zone_id);
    if (a.row !== b.row) return a.row - b.row;
    if (a.level !== b.level) return a.level - b.level;
    return a.position - b.position;
  });

  // 7. Return top 5 recommendations
  const recommendations: SlotRecommendation[] = filteredSlots.slice(0, 5).map((slot) => ({
    id: slot.id,
    coordinate: slot.coordinate,
    zone_id: slot.zone_id,
    zone_name: slot.zone.name,
    zone_type: slot.zone.zone_type,
    row: slot.row,
    level: slot.level,
    position: slot.position,
  }));

  return recommendations;
}


/**
 * Confirms slot assignment for a lot.
 *
 * Requirement 4.5: When Warehouse_Operator confirms placement at a recommended slot:
 * 1. Update rack_slot status to 'occupied'
 * 2. Set current_lot_id on the slot
 * 3. Create audit trail record of the placement
 *
 * @param lotId - The lot ID to assign
 * @param slotId - The rack slot ID to assign the lot to
 * @param userId - The user performing the assignment (for audit trail)
 * @returns The updated rack slot
 * @throws Error if lot not found
 * @throws Error if lot not in ready_to_store status
 * @throws Error if slot not found
 * @throws Error if slot not available
 */
export async function assignSlot(
  lotId: string,
  slotId: string,
  userId: string
): Promise<RackSlot> {
  // 1. Verify lot exists
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
  });

  if (!lot) {
    throw new Error(`Lot not found: ${lotId}`);
  }

  // 2. Verify lot is in ready_to_store status
  if (lot.status !== 'ready_to_store') {
    throw new Error(`Lot is not ready to store. Current status: ${lot.status}`);
  }

  // 3. Verify slot exists
  const slot = await prisma.rackSlot.findUnique({
    where: { id: slotId },
    include: { zone: true },
  });

  if (!slot) {
    throw new Error(`Slot not found: ${slotId}`);
  }

  // 4. Verify slot is available
  if (slot.status !== 'available') {
    throw new Error(`Slot is not available. Current status: ${slot.status}`);
  }

  // 5. In a transaction: update slot status and create audit trail
  const updatedSlot = await prisma.$transaction(async (tx) => {
    // Update rack_slot status to 'occupied' and set current_lot_id
    const updated = await tx.rackSlot.update({
      where: { id: slotId },
      data: {
        status: 'occupied',
        current_lot_id: lotId,
      },
    });

    // Create audit trail record of the placement (slot perspective)
    await tx.auditTrail.create({
      data: {
        user_id: userId,
        action: 'slot_assignment',
        entity_type: 'rack_slot',
        entity_id: slotId,
        old_value: {
          status: 'available',
          current_lot_id: null,
          coordinate: slot.coordinate,
        },
        new_value: {
          status: 'occupied',
          current_lot_id: lotId,
          lot_number: lot.lot_number,
          coordinate: slot.coordinate,
        },
      },
    });

    // Create audit trail record for drum location change (Req 6.2)
    // Records the drum/lot placement with old coordinate "None" for initial placement
    await tx.auditTrail.create({
      data: {
        user_id: userId,
        action: 'drum_placement',
        entity_type: 'drum',
        entity_id: lotId,
        old_value: {
          coordinate: 'None',
          lot_number: lot.lot_number,
        },
        new_value: {
          coordinate: slot.coordinate,
          lot_number: lot.lot_number,
          slot_id: slotId,
        },
      },
    });

    return updated;
  });

  return updatedSlot;
}


/**
 * Overrides slot assignment with mandatory justification.
 *
 * Requirement 4.6: When Warehouse_Operator places a drum at a non-recommended slot,
 * require justification of at least 10 characters.
 * Requirement 4.7: Record override justification in audit trail and notify Factory_Manager.
 *
 * @param lotId - The lot ID to assign
 * @param slotId - The rack slot ID to override placement to
 * @param justification - Override justification (minimum 10 characters)
 * @param userId - The user performing the override (for audit trail)
 * @returns The updated rack slot
 * @throws Error if justification is less than 10 characters
 * @throws Error if lot not found
 * @throws Error if lot not in ready_to_store status
 * @throws Error if slot not found
 * @throws Error if slot not available
 */
export async function overrideSlot(
  lotId: string,
  slotId: string,
  justification: string,
  userId: string
): Promise<RackSlot> {
  // 1. Validate justification length
  if (!justification || justification.trim().length < 10) {
    throw new Error('Justification must be at least 10 characters');
  }

  // 2. Verify lot exists
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
  });

  if (!lot) {
    throw new Error(`Lot not found: ${lotId}`);
  }

  // 3. Verify lot is in ready_to_store status
  if (lot.status !== 'ready_to_store') {
    throw new Error(`Lot is not ready to store. Current status: ${lot.status}`);
  }

  // 4. Verify slot exists
  const slot = await prisma.rackSlot.findUnique({
    where: { id: slotId },
    include: { zone: true },
  });

  if (!slot) {
    throw new Error(`Slot not found: ${slotId}`);
  }

  // 5. Verify slot is available
  if (slot.status !== 'available') {
    throw new Error(`Slot is not available. Current status: ${slot.status}`);
  }

  // 6. In a transaction: update slot status and create audit trail with override justification
  const updatedSlot = await prisma.$transaction(async (tx) => {
    // Update rack_slot status to 'occupied' and set current_lot_id
    const updated = await tx.rackSlot.update({
      where: { id: slotId },
      data: {
        status: 'occupied',
        current_lot_id: lotId,
      },
    });

    // Create audit trail record with override justification (slot perspective)
    await tx.auditTrail.create({
      data: {
        user_id: userId,
        action: 'slot_override',
        entity_type: 'rack_slot',
        entity_id: slotId,
        old_value: {
          status: 'available',
          current_lot_id: null,
          coordinate: slot.coordinate,
        },
        new_value: {
          status: 'occupied',
          current_lot_id: lotId,
          lot_number: lot.lot_number,
          coordinate: slot.coordinate,
          override_justification: justification.trim(),
        },
      },
    });

    // Create audit trail record for drum location change (Req 6.2)
    // Records the drum/lot placement with old coordinate "None" for initial placement
    await tx.auditTrail.create({
      data: {
        user_id: userId,
        action: 'drum_placement',
        entity_type: 'drum',
        entity_id: lotId,
        old_value: {
          coordinate: 'None',
          lot_number: lot.lot_number,
        },
        new_value: {
          coordinate: slot.coordinate,
          lot_number: lot.lot_number,
          slot_id: slotId,
          override_justification: justification.trim(),
        },
      },
    });

    return updated;
  });

  // 7. Emit Socket.IO event 'slot:override' to notify Factory_Manager
  io.emit('slot:override', {
    lotId,
    slotId,
    justification: justification.trim(),
    userId,
    timestamp: new Date().toISOString(),
  });

  return updatedSlot;
}
