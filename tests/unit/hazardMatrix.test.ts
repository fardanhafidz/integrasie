import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isCompatible, getMinSeparation } from '@server/modules/slotting/hazardMatrix';

// Mock the prisma client
vi.mock('@server/config/database', () => ({
  prisma: {
    hazardSegregationMatrix: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@server/config/database';

const mockedPrisma = vi.mocked(prisma);

describe('hazardMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isCompatible', () => {
    it('should return true when same class is compared with itself', async () => {
      const result = await isCompatible('flammable', 'flammable');

      expect(result).toBe(true);
      // Should not query the database for same-class comparison
      expect(mockedPrisma.hazardSegregationMatrix.findFirst).not.toHaveBeenCalled();
    });

    it('should return true when matrix entry shows compatible', async () => {
      mockedPrisma.hazardSegregationMatrix.findFirst.mockResolvedValue({
        id: 'entry-1',
        hazard_class_a: 'oxidizer',
        hazard_class_b: 'corrosive',
        is_compatible: true,
        min_separation_slots: 0,
      });

      const result = await isCompatible('oxidizer', 'corrosive');

      expect(result).toBe(true);
      expect(mockedPrisma.hazardSegregationMatrix.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { hazard_class_a: 'oxidizer', hazard_class_b: 'corrosive' },
            { hazard_class_a: 'corrosive', hazard_class_b: 'oxidizer' },
          ],
        },
      });
    });

    it('should return false when matrix entry shows incompatible', async () => {
      mockedPrisma.hazardSegregationMatrix.findFirst.mockResolvedValue({
        id: 'entry-2',
        hazard_class_a: 'flammable',
        hazard_class_b: 'oxidizer',
        is_compatible: false,
        min_separation_slots: 3,
      });

      const result = await isCompatible('flammable', 'oxidizer');

      expect(result).toBe(false);
    });

    it('should return false (default) when no matrix entry is found', async () => {
      mockedPrisma.hazardSegregationMatrix.findFirst.mockResolvedValue(null);

      const result = await isCompatible('unknown_class_a', 'unknown_class_b');

      expect(result).toBe(false);
    });

    it('should check both directions (symmetric matrix)', async () => {
      mockedPrisma.hazardSegregationMatrix.findFirst.mockResolvedValue({
        id: 'entry-3',
        hazard_class_a: 'corrosive',
        hazard_class_b: 'flammable',
        is_compatible: true,
        min_separation_slots: 1,
      });

      const result = await isCompatible('flammable', 'corrosive');

      expect(result).toBe(true);
      // Verify the OR clause checks both directions
      expect(mockedPrisma.hazardSegregationMatrix.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { hazard_class_a: 'flammable', hazard_class_b: 'corrosive' },
            { hazard_class_a: 'corrosive', hazard_class_b: 'flammable' },
          ],
        },
      });
    });
  });

  describe('getMinSeparation', () => {
    it('should return 0 when same class is compared with itself', async () => {
      const result = await getMinSeparation('flammable', 'flammable');

      expect(result).toBe(0);
      // Should not query the database for same-class comparison
      expect(mockedPrisma.hazardSegregationMatrix.findFirst).not.toHaveBeenCalled();
    });

    it('should return the min_separation_slots value from the matrix', async () => {
      mockedPrisma.hazardSegregationMatrix.findFirst.mockResolvedValue({
        id: 'entry-4',
        hazard_class_a: 'flammable',
        hazard_class_b: 'oxidizer',
        is_compatible: false,
        min_separation_slots: 3,
      });

      const result = await getMinSeparation('flammable', 'oxidizer');

      expect(result).toBe(3);
    });

    it('should return 0 (default) when no matrix entry is found', async () => {
      mockedPrisma.hazardSegregationMatrix.findFirst.mockResolvedValue(null);

      const result = await getMinSeparation('unknown_a', 'unknown_b');

      expect(result).toBe(0);
    });

    it('should check both directions (symmetric matrix)', async () => {
      mockedPrisma.hazardSegregationMatrix.findFirst.mockResolvedValue({
        id: 'entry-5',
        hazard_class_a: 'toxic',
        hazard_class_b: 'flammable',
        is_compatible: false,
        min_separation_slots: 5,
      });

      const result = await getMinSeparation('flammable', 'toxic');

      expect(result).toBe(5);
      expect(mockedPrisma.hazardSegregationMatrix.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { hazard_class_a: 'flammable', hazard_class_b: 'toxic' },
            { hazard_class_a: 'toxic', hazard_class_b: 'flammable' },
          ],
        },
      });
    });

    it('should return 0 when entry exists with zero separation', async () => {
      mockedPrisma.hazardSegregationMatrix.findFirst.mockResolvedValue({
        id: 'entry-6',
        hazard_class_a: 'corrosive',
        hazard_class_b: 'non_flammable',
        is_compatible: true,
        min_separation_slots: 0,
      });

      const result = await getMinSeparation('corrosive', 'non_flammable');

      expect(result).toBe(0);
    });
  });
});
