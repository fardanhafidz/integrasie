import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLotNumber, LOT_NUMBER_REGEX } from '@server/modules/intake/lotGenerator';

// Mock the prisma client
vi.mock('@server/config/database', () => ({
  prisma: {
    lot: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from '@server/config/database';

const mockedPrisma = vi.mocked(prisma);

describe('lotGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LOT_NUMBER_REGEX', () => {
    it('should match valid lot numbers', () => {
      expect(LOT_NUMBER_REGEX.test('RC-20250525-0001')).toBe(true);
      expect(LOT_NUMBER_REGEX.test('PM-20250101-0099')).toBe(true);
      expect(LOT_NUMBER_REGEX.test('SV-20231231-9999')).toBe(true);
      expect(LOT_NUMBER_REGEX.test('ABCDE-20250525-0001')).toBe(true);
      expect(LOT_NUMBER_REGEX.test('AB-20250525-0001')).toBe(true);
    });

    it('should reject invalid lot numbers', () => {
      // Single letter code (too short)
      expect(LOT_NUMBER_REGEX.test('A-20250525-0001')).toBe(false);
      // 6 letter code (too long)
      expect(LOT_NUMBER_REGEX.test('ABCDEF-20250525-0001')).toBe(false);
      // Lowercase code
      expect(LOT_NUMBER_REGEX.test('rc-20250525-0001')).toBe(false);
      // Wrong date format (7 digits)
      expect(LOT_NUMBER_REGEX.test('RC-2025052-0001')).toBe(false);
      // Wrong sequence (3 digits)
      expect(LOT_NUMBER_REGEX.test('RC-20250525-001')).toBe(false);
      // Wrong sequence (5 digits)
      expect(LOT_NUMBER_REGEX.test('RC-20250525-00001')).toBe(false);
      // Missing parts
      expect(LOT_NUMBER_REGEX.test('RC-20250525')).toBe(false);
      expect(LOT_NUMBER_REGEX.test('RC-0001')).toBe(false);
      // Empty string
      expect(LOT_NUMBER_REGEX.test('')).toBe(false);
    });
  });

  describe('generateLotNumber', () => {
    it('should generate the first lot number of the day (0001)', async () => {
      mockedPrisma.lot.count.mockResolvedValue(0);

      const result = await generateLotNumber('RC', new Date(2025, 4, 25)); // May 25, 2025

      expect(result).toBe('RC-20250525-0001');
      expect(mockedPrisma.lot.count).toHaveBeenCalledWith({
        where: {
          material_group_code: 'RC',
          lot_number: {
            startsWith: 'RC-20250525-',
          },
        },
      });
    });

    it('should generate sequential lot numbers', async () => {
      mockedPrisma.lot.count.mockResolvedValue(5);

      const result = await generateLotNumber('PM', new Date(2025, 0, 1)); // Jan 1, 2025

      expect(result).toBe('PM-20250101-0006');
    });

    it('should handle different material group codes', async () => {
      mockedPrisma.lot.count.mockResolvedValue(0);

      const result = await generateLotNumber('SV', new Date(2025, 11, 31)); // Dec 31, 2025

      expect(result).toBe('SV-20251231-0001');
    });

    it('should handle 5-letter material group codes', async () => {
      mockedPrisma.lot.count.mockResolvedValue(2);

      const result = await generateLotNumber('ABCDE', new Date(2025, 5, 15)); // Jun 15, 2025

      expect(result).toBe('ABCDE-20250615-0003');
    });

    it('should zero-pad sequence numbers correctly', async () => {
      mockedPrisma.lot.count.mockResolvedValue(99);

      const result = await generateLotNumber('RC', new Date(2025, 4, 25));

      expect(result).toBe('RC-20250525-0100');
    });

    it('should handle high sequence numbers', async () => {
      mockedPrisma.lot.count.mockResolvedValue(9998);

      const result = await generateLotNumber('RC', new Date(2025, 4, 25));

      expect(result).toBe('RC-20250525-9999');
    });

    it('should throw error for invalid material group code (lowercase)', async () => {
      await expect(
        generateLotNumber('rc', new Date(2025, 4, 25))
      ).rejects.toThrow('Invalid material group code');
    });

    it('should throw error for invalid material group code (too short)', async () => {
      await expect(
        generateLotNumber('A', new Date(2025, 4, 25))
      ).rejects.toThrow('Invalid material group code');
    });

    it('should throw error for invalid material group code (too long)', async () => {
      await expect(
        generateLotNumber('ABCDEF', new Date(2025, 4, 25))
      ).rejects.toThrow('Invalid material group code');
    });

    it('should throw error for invalid material group code (contains numbers)', async () => {
      await expect(
        generateLotNumber('R1', new Date(2025, 4, 25))
      ).rejects.toThrow('Invalid material group code');
    });

    it('should throw error for empty material group code', async () => {
      await expect(
        generateLotNumber('', new Date(2025, 4, 25))
      ).rejects.toThrow('Invalid material group code');
    });

    it('should produce lot numbers matching LOT_NUMBER_REGEX', async () => {
      mockedPrisma.lot.count.mockResolvedValue(0);

      const result = await generateLotNumber('RC', new Date(2025, 4, 25));

      expect(LOT_NUMBER_REGEX.test(result)).toBe(true);
    });

    it('should format single-digit months with leading zero', async () => {
      mockedPrisma.lot.count.mockResolvedValue(0);

      const result = await generateLotNumber('RC', new Date(2025, 0, 5)); // Jan 5

      expect(result).toBe('RC-20250105-0001');
    });

    it('should format single-digit days with leading zero', async () => {
      mockedPrisma.lot.count.mockResolvedValue(0);

      const result = await generateLotNumber('RC', new Date(2025, 9, 3)); // Oct 3

      expect(result).toBe('RC-20251003-0001');
    });
  });
});
