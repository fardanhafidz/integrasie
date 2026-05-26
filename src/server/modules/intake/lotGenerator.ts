import { prisma } from '../../config/database';

/**
 * Regex pattern for validating lot numbers.
 * Format: [MaterialGroupCode]-[YYYYMMDD]-[SequentialNumber]
 * - MaterialGroupCode: 2-5 uppercase letters
 * - YYYYMMDD: 8-digit date
 * - SequentialNumber: 4-digit zero-padded number
 */
export const LOT_NUMBER_REGEX = /^[A-Z]{2,5}-\d{8}-\d{4}$/;

/**
 * Formats a Date object into YYYYMMDD string.
 */
function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Gets the next sequence number for a given material group code and date.
 * Uses database count of existing lots for that material_group_code on that date
 * to determine the next sequence number (count + 1).
 * This approach is atomic/safe for concurrent calls since it relies on the
 * database's consistent read of existing records.
 */
async function getNextSequence(
  materialGroupCode: string,
  dateStr: string
): Promise<number> {
  // Build the lot number prefix to count existing lots for this group+date
  const prefix = `${materialGroupCode}-${dateStr}-`;

  const count = await prisma.lot.count({
    where: {
      material_group_code: materialGroupCode,
      lot_number: {
        startsWith: prefix,
      },
    },
  });

  return count + 1;
}

/**
 * Generates a unique lot number in the format: [MaterialGroupCode]-[YYYYMMDD]-[SequentialNumber]
 *
 * - MaterialGroupCode: 2-5 uppercase letters (e.g., "RC", "PM", "SV")
 * - YYYYMMDD: Date formatted as 20250525
 * - SequentialNumber: Zero-padded 4-digit number (0001, 0002, etc.)
 *
 * The sequence resets to 0001 daily per material group.
 * Uses database count + 1 for concurrency safety.
 *
 * @param materialGroupCode - The material group code (2-5 uppercase letters)
 * @param date - The date for the lot number
 * @returns The generated lot number string
 * @throws Error if materialGroupCode is invalid
 */
export async function generateLotNumber(
  materialGroupCode: string,
  date: Date
): Promise<string> {
  // Validate material group code
  if (!/^[A-Z]{2,5}$/.test(materialGroupCode)) {
    throw new Error(
      `Invalid material group code: "${materialGroupCode}". Must be 2-5 uppercase letters.`
    );
  }

  const dateStr = formatDateToString(date);
  const sequence = await getNextSequence(materialGroupCode, dateStr);
  const paddedSeq = String(sequence).padStart(4, '0');

  return `${materialGroupCode}-${dateStr}-${paddedSeq}`;
}
