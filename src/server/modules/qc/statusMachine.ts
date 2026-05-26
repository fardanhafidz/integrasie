import { LotStatus } from '@shared/types';
import { prisma } from '@server/config/database';
import { io } from '@server/index';
import { emitLotReadyToStore } from '@server/modules/notification/notification.service';

/**
 * Valid lot status transitions.
 * Maps each status to the set of statuses it can transition to.
 *
 * State machine:
 *   pending_qc → passed (QC passed)
 *   pending_qc → rejected (QC rejected)
 *   passed → ready_to_store (ready for warehouse placement)
 */
export const VALID_TRANSITIONS: Record<LotStatus, LotStatus[]> = {
  [LotStatus.PENDING_QC]: [LotStatus.PASSED, LotStatus.REJECTED],
  [LotStatus.PASSED]: [LotStatus.READY_TO_STORE],
  [LotStatus.REJECTED]: [],
  [LotStatus.READY_TO_STORE]: [],
};

/**
 * Checks if a transition from currentStatus to newStatus is allowed.
 */
export function isValidTransition(
  currentStatus: LotStatus,
  newStatus: LotStatus
): boolean {
  const validNextStatuses = VALID_TRANSITIONS[currentStatus];
  return validNextStatuses.includes(newStatus);
}

/**
 * Returns the array of valid next statuses for a given current status.
 */
export function getValidNextStatuses(currentStatus: LotStatus): LotStatus[] {
  return VALID_TRANSITIONS[currentStatus];
}

/**
 * Validates the transition and updates the lot status in the database.
 * Throws an error if the transition is invalid.
 *
 * @param lotId - The ID of the lot to transition
 * @param newStatus - The desired new status
 * @param userId - The ID of the user performing the transition
 * @returns The updated Lot record
 * @throws Error if the lot is not found or the transition is invalid
 */
export async function transitionLotStatus(
  lotId: string,
  newStatus: LotStatus,
  userId: string
) {
  // Fetch the current lot
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
  });

  if (!lot) {
    throw new Error(`Lot with id '${lotId}' not found`);
  }

  const currentStatus = lot.status as LotStatus;

  // Validate the transition
  if (!isValidTransition(currentStatus, newStatus)) {
    const validList = getValidNextStatuses(currentStatus)
      .map((s) => s)
      .join(', ');

    throw Object.assign(
      new Error(
        `Cannot transition from ${currentStatus} to ${newStatus}. Valid transitions: ${validList || 'none'}`
      ),
      {
        error: 'Invalid status transition',
        message: `Cannot transition from ${currentStatus} to ${newStatus}. Valid transitions: ${validList || 'none'}`,
      }
    );
  }

  // Perform the update
  const updatedLot = await prisma.lot.update({
    where: { id: lotId },
    data: {
      status: newStatus,
      updated_at: new Date(),
    },
    include: {
      supplier_intake: {
        select: {
          material_group: true,
        },
      },
    },
  });

  // Emit notification when lot transitions to ready_to_store
  // Requirement 3.6: Notify Warehouse_Operator within 10 seconds of status change
  if (newStatus === LotStatus.READY_TO_STORE) {
    emitLotReadyToStore(
      updatedLot.id,
      updatedLot.lot_number,
      updatedLot.supplier_intake?.material_group ?? ''
    );

    // Emit PPIC stock update event for real-time dashboard updates
    // Requirement 8.2: Real-time stock visibility for PPIC team
    io.emit('ppic:stock_update', {
      lotId: updatedLot.id,
      lotNumber: updatedLot.lot_number,
      status: 'ready_to_store',
      timestamp: new Date().toISOString(),
    });
  }

  return updatedLot;
}
