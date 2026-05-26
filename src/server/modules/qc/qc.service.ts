import { prisma } from '../../config/database';
import { LotStatus, QCDecision } from '@prisma/client';

/**
 * QC Service
 * Handles quality control queue management and decision recording.
 * Requirements: 3.1, 3.2, 3.3
 */

/**
 * Get all lots with status 'pending_qc' ordered by delivery date ascending (oldest first).
 * Includes supplier intake details: supplier_name, material_group, quantity, delivery_date.
 * Requirement 3.1: Display all lots with Lot_Status "Pending QC" in chronological queue
 */
export async function getPendingQCQueue() {
  const lots = await prisma.lot.findMany({
    where: {
      status: LotStatus.pending_qc,
    },
    orderBy: {
      supplier_intake: {
        delivery_date: 'asc',
      },
    },
    include: {
      supplier_intake: {
        select: {
          supplier_name: true,
          material_group: true,
          quantity: true,
          delivery_date: true,
        },
      },
    },
  });

  return lots;
}

/**
 * Get lot details with supplier intake data for QC review.
 * Requirement 3.2: Display lot details including supplier name, material group, quantity, delivery date
 */
export async function getLotDetails(lotId: string) {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: {
      supplier_intake: {
        select: {
          id: true,
          supplier_name: true,
          material_group: true,
          material_group_code: true,
          quantity: true,
          unit: true,
          delivery_date: true,
          truck_reference: true,
        },
      },
    },
  });

  if (!lot) {
    throw new Error(`Lot with id '${lotId}' not found`);
  }

  return lot;
}

/**
 * Submit a QC result for a lot.
 * Requirement 3.3: Record QC decision with parameters
 * 
 * Steps:
 * 1. Verify lot exists and has status 'pending_qc'
 * 2. Create QCResult record with parameters, decision, rejection_reason, tested_by
 * 3. Update lot status: if passed → 'passed', if rejected → 'rejected'
 * 4. Return the created QC result
 */
export async function submitQCResult(
  lotId: string,
  params: object,
  decision: 'passed' | 'rejected',
  rejectionReason: string | null,
  testedBy: string
) {
  // 1. Verify lot exists and has status 'pending_qc'
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
  });

  if (!lot) {
    throw new Error(`Lot with id '${lotId}' not found`);
  }

  if (lot.status !== LotStatus.pending_qc) {
    throw new Error(
      `Lot '${lotId}' has status '${lot.status}' and cannot be submitted for QC. Only lots with status 'pending_qc' can be submitted.`
    );
  }

  // Determine the new lot status based on decision
  const newStatus: LotStatus =
    decision === 'passed' ? LotStatus.passed : LotStatus.rejected;

  // 2 & 3. Create QC result, update lot status, and record audit trail in a transaction (Req 6.1, 6.6)
  const result = await prisma.$transaction(async (tx) => {
    // Create QCResult record
    const qcResult = await tx.qCResult.create({
      data: {
        lot_id: lotId,
        parameters: params as any,
        decision: decision as QCDecision,
        rejection_reason: rejectionReason,
        tested_by: testedBy,
        tested_at: new Date(),
      },
    });

    // Update lot status
    await tx.lot.update({
      where: { id: lotId },
      data: {
        status: newStatus,
      },
    });

    // Create audit trail record within the same transaction (Req 6.1, 6.6)
    // If this fails, the entire transaction (QC result + status change) is rolled back
    await tx.auditTrail.create({
      data: {
        user_id: testedBy,
        action: 'qc_decision',
        entity_type: 'lot',
        entity_id: lotId,
        old_value: { status: 'pending_qc' },
        new_value: {
          status: newStatus,
          decision,
          rejection_reason: rejectionReason,
        },
        timestamp: new Date(),
      },
    });

    return qcResult;
  });

  // 4. Return the created QC result
  return result;
}

/**
 * Get all QC results for a lot, ordered by tested_at descending (most recent first).
 */
export async function getQCHistory(lotId: string) {
  // Verify lot exists
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
  });

  if (!lot) {
    throw new Error(`Lot with id '${lotId}' not found`);
  }

  const results = await prisma.qCResult.findMany({
    where: { lot_id: lotId },
    orderBy: { tested_at: 'desc' },
    include: {
      tester: {
        select: {
          id: true,
          full_name: true,
          email: true,
        },
      },
    },
  });

  return results;
}
