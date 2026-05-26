import { prisma } from '@server/config/database';

/**
 * Checks hazard compatibility between two hazard classes using the
 * hazard_segregation_matrix table.
 *
 * The matrix is symmetric: A-B is the same as B-A, so both directions
 * are checked. If no entry is found, defaults to incompatible (false)
 * for safety.
 *
 * @param classA - First hazard class
 * @param classB - Second hazard class
 * @returns true if the two classes are compatible, false otherwise
 */
export async function isCompatible(classA: string, classB: string): Promise<boolean> {
  // Same class is always compatible with itself
  if (classA === classB) {
    return true;
  }

  const entry = await prisma.hazardSegregationMatrix.findFirst({
    where: {
      OR: [
        { hazard_class_a: classA, hazard_class_b: classB },
        { hazard_class_a: classB, hazard_class_b: classA },
      ],
    },
  });

  // Default to incompatible (false) if no entry found — safety first
  if (!entry) {
    return false;
  }

  return entry.is_compatible;
}

/**
 * Returns the minimum separation slots required between two hazard classes.
 *
 * The matrix is symmetric: A-B is the same as B-A, so both directions
 * are checked. If no entry is found, defaults to 0.
 *
 * @param classA - First hazard class
 * @param classB - Second hazard class
 * @returns The minimum number of slots required between the two classes
 */
export async function getMinSeparation(classA: string, classB: string): Promise<number> {
  // Same class needs no separation
  if (classA === classB) {
    return 0;
  }

  const entry = await prisma.hazardSegregationMatrix.findFirst({
    where: {
      OR: [
        { hazard_class_a: classA, hazard_class_b: classB },
        { hazard_class_a: classB, hazard_class_b: classA },
      ],
    },
  });

  // Default to 0 if not found
  if (!entry) {
    return 0;
  }

  return entry.min_separation_slots;
}
