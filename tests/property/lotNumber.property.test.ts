/**
 * Property-Based Test: Lot Number Uniqueness and Format
 *
 * Feature: integrasie-smart-dashboard, Property 2: Lot Number Uniqueness and Format
 *
 * Validates: Requirements 2.2
 *
 * Property: For any generated lot number, each lot number is unique across the
 * system and matches the regex pattern `^[A-Z]{2,5}-\d{8}-\d{4}$`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock Prisma before importing the module under test
vi.mock('@server/config/database', () => {
  return {
    prisma: {
      lot: {
        count: vi.fn(),
      },
    },
  };
});

import { generateLotNumber, LOT_NUMBER_REGEX } from '@server/modules/intake/lotGenerator';
import { prisma } from '@server/config/database';

const mockedPrisma = vi.mocked(prisma);

/**
 * Arbitrary: Generates a valid material group code (2-5 uppercase letters).
 */
const materialGroupCodeArb = fc
  .stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
    minLength: 2,
    maxLength: 5,
  });

/**
 * Arbitrary: Generates a valid Date object within a reasonable range.
 * Dates between 2020-01-01 and 2030-12-31.
 */
const validDateArb = fc
  .date({
    min: new Date('2020-01-01T00:00:00Z'),
    max: new Date('2030-12-31T23:59:59Z'),
  });

/**
 * Arbitrary: Generates a sequence count (simulating existing lots in DB).
 * Range 0-9998 to ensure the next sequence (count+1) fits in 4 digits.
 */
const sequenceCountArb = fc.integer({ min: 0, max: 9998 });

/**
 * Helper: Format a date to YYYYMMDD string (same logic as lotGenerator).
 */
function formatDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

describe('Feature: integrasie-smart-dashboard, Property 2: Lot Number Uniqueness and Format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 2a: For any valid material group code (2-5 uppercase letters)
   * and any valid date, the generated lot number matches LOT_NUMBER_REGEX.
   *
   * Validates: Requirements 2.2
   */
  it('Property 2a: Generated lot number always matches the format regex ^[A-Z]{2,5}-\\d{8}-\\d{4}$', async () => {
    await fc.assert(
      fc.asyncProperty(
        materialGroupCodeArb,
        validDateArb,
        sequenceCountArb,
        async (code, date, existingCount) => {
          // Mock the database to return the existing count
          mockedPrisma.lot.count.mockResolvedValue(existingCount);

          const lotNumber = await generateLotNumber(code, date);

          // The generated lot number must match the regex
          expect(lotNumber).toMatch(LOT_NUMBER_REGEX);
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2b: For any sequence of lot number generations with the same
   * material group code and date, each generated lot number is unique (sequential).
   *
   * Validates: Requirements 2.2
   */
  it('Property 2b: Sequential lot numbers for same code and date are always unique', async () => {
    await fc.assert(
      fc.asyncProperty(
        materialGroupCodeArb,
        validDateArb,
        fc.integer({ min: 2, max: 10 }),
        async (code, date, numGenerations) => {
          const generatedLotNumbers: string[] = [];

          // Simulate sequential generation by incrementing the count
          for (let i = 0; i < numGenerations; i++) {
            mockedPrisma.lot.count.mockResolvedValue(i);
            const lotNumber = await generateLotNumber(code, date);
            generatedLotNumbers.push(lotNumber);
          }

          // All generated lot numbers must be unique
          const uniqueSet = new Set(generatedLotNumbers);
          expect(uniqueSet.size).toBe(generatedLotNumbers.length);
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2c: For different material group codes on the same date,
   * lot numbers have different prefixes.
   *
   * Validates: Requirements 2.2
   */
  it('Property 2c: Different material group codes produce lot numbers with different prefixes', async () => {
    // Generate two distinct material group codes using a tuple with filter
    const distinctCodesArb = fc
      .tuple(materialGroupCodeArb, materialGroupCodeArb)
      .filter(([a, b]) => a !== b);

    await fc.assert(
      fc.asyncProperty(
        distinctCodesArb,
        validDateArb,
        sequenceCountArb,
        async ([codeA, codeB], date, existingCount) => {
          mockedPrisma.lot.count.mockResolvedValue(existingCount);

          const lotNumberA = await generateLotNumber(codeA, date);
          const lotNumberB = await generateLotNumber(codeB, date);

          // Extract the prefix (material group code part)
          const prefixA = lotNumberA.split('-')[0];
          const prefixB = lotNumberB.split('-')[0];

          expect(prefixA).toBe(codeA);
          expect(prefixB).toBe(codeB);
          expect(prefixA).not.toBe(prefixB);
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2d: For the same material group code on different dates,
   * lot numbers have different date segments.
   *
   * Validates: Requirements 2.2
   */
  it('Property 2d: Same material group code on different dates produces different date segments', async () => {
    // Generate two dates that are on different calendar days
    const distinctDatesArb = fc
      .tuple(validDateArb, validDateArb)
      .filter(([a, b]) => formatDateStr(a) !== formatDateStr(b));

    await fc.assert(
      fc.asyncProperty(
        materialGroupCodeArb,
        distinctDatesArb,
        sequenceCountArb,
        async (code, [dateA, dateB], existingCount) => {
          mockedPrisma.lot.count.mockResolvedValue(existingCount);

          const lotNumberA = await generateLotNumber(code, dateA);
          const lotNumberB = await generateLotNumber(code, dateB);

          // Extract the date segment (middle part)
          const dateSegmentA = lotNumberA.split('-')[1];
          const dateSegmentB = lotNumberB.split('-')[1];

          // Date segments must be different for different dates
          expect(dateSegmentA).not.toBe(dateSegmentB);

          // Date segments must be 8 digits (YYYYMMDD)
          expect(dateSegmentA).toMatch(/^\d{8}$/);
          expect(dateSegmentB).toMatch(/^\d{8}$/);
        }
      ),
      { numRuns: 100 },
    );
  });
});
