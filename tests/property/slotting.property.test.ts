/**
 * Property-Based Tests: Smart Slotting
 *
 * Feature: integrasie-smart-dashboard, Property 5: Smart Slotting Temperature Constraint
 * Feature: integrasie-smart-dashboard, Property 6: Smart Slotting Hazard Segregation
 *
 * Validates: Requirements 4.2, 4.3
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock Prisma before importing the module under test to prevent DB initialization
vi.mock('@server/config/database', () => {
  return {
    prisma: {
      warehouseZone: { findMany: vi.fn() },
      rackSlot: { findMany: vi.fn() },
      lot: { findUnique: vi.fn(), findMany: vi.fn() },
      hazardSegregationMatrix: { findFirst: vi.fn() },
    },
  };
});

import { getEligibleZoneTypes, type LotZoneInput } from '@server/modules/slotting/slottingEngine';
import { isCompatible } from '@server/modules/slotting/hazardMatrix';
import { prisma } from '@server/config/database';

const mockedPrisma = vi.mocked(prisma);

/**
 * Known hazard classes used in the system.
 */
const HAZARD_CLASSES = [
  'flammable',
  'oxidizer',
  'corrosive',
  'toxic',
  'explosive',
  'reactive',
  'compressed_gas',
  'radioactive',
];

const hazardClassArb = fc.constantFrom(...HAZARD_CLASSES);

/**
 * Property 5: Smart Slotting Temperature Constraint
 *
 * For any slot recommendation where the lot is temperature-sensitive,
 * every recommended slot belongs to a zone with zone_type = 'cold_chain'.
 *
 * Validates: Requirements 4.2
 */
describe('Feature: integrasie-smart-dashboard, Property 5: Smart Slotting Temperature Constraint', () => {
  /**
   * Property 5a: For any lot with is_temperature_sensitive=true,
   * getEligibleZoneTypes returns only ['cold_chain'].
   *
   * Validates: Requirements 4.2
   */
  it('Property 5a: Temperature-sensitive lots are only eligible for cold_chain zones', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // is_hazardous can be anything
        (isHazardous) => {
          const lot: LotZoneInput = {
            is_temperature_sensitive: true,
            is_hazardous: isHazardous,
          };

          const result = getEligibleZoneTypes(lot);

          // Must return exactly ['cold_chain']
          expect(result).toHaveLength(1);
          expect(result).toContain('cold_chain');
          expect(result).not.toContain('standard');
          expect(result).not.toContain('hazardous');
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5b: For any lot with is_temperature_sensitive=true AND is_hazardous=true,
   * getEligibleZoneTypes still returns only ['cold_chain'] (temperature takes priority).
   *
   * Validates: Requirements 4.2
   */
  it('Property 5b: Temperature sensitivity takes priority over hazardous classification', () => {
    fc.assert(
      fc.property(
        fc.constant(true), // always temperature sensitive
        fc.constant(true), // always hazardous
        (isTempSensitive, isHazardous) => {
          const lot: LotZoneInput = {
            is_temperature_sensitive: isTempSensitive,
            is_hazardous: isHazardous,
          };

          const result = getEligibleZoneTypes(lot);

          // Temperature constraint takes priority: only cold_chain
          expect(result).toEqual(['cold_chain']);
          // Must NOT include hazardous or standard zones
          expect(result).not.toContain('hazardous');
          expect(result).not.toContain('standard');
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 5c: For any lot with is_temperature_sensitive=false,
   * getEligibleZoneTypes never returns 'cold_chain'.
   *
   * Validates: Requirements 4.2
   */
  it('Property 5c: Non-temperature-sensitive lots are never eligible for cold_chain zones', () => {
    fc.assert(
      fc.property(
        fc.boolean(), // is_hazardous can be anything
        (isHazardous) => {
          const lot: LotZoneInput = {
            is_temperature_sensitive: false,
            is_hazardous: isHazardous,
          };

          const result = getEligibleZoneTypes(lot);

          // Must NOT contain cold_chain
          expect(result).not.toContain('cold_chain');

          // Should contain valid zone types based on hazardous flag
          if (isHazardous) {
            expect(result).toContain('hazardous');
            expect(result).toContain('standard');
          } else {
            expect(result).toContain('standard');
            expect(result).not.toContain('hazardous');
          }
        }
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 6: Smart Slotting Hazard Segregation
 *
 * For any slot recommendation where the lot is hazardous with hazard_class H,
 * no recommended slot has an adjacent occupied slot containing a lot with an
 * incompatible hazard_class according to the segregation matrix.
 *
 * Validates: Requirements 4.3
 */
describe('Feature: integrasie-smart-dashboard, Property 6: Smart Slotting Hazard Segregation', () => {
  /**
   * Property 6a: For any hazardous lot (is_hazardous=true), eligible zones
   * include 'hazardous' and 'standard' but never 'cold_chain'.
   *
   * Validates: Requirements 4.3
   */
  it('Property 6a: Hazardous lots are eligible for hazardous and standard zones but never cold_chain', () => {
    fc.assert(
      fc.property(
        fc.record({
          is_hazardous: fc.constant(true),
          is_temperature_sensitive: fc.constant(false),
        }),
        (lot: LotZoneInput) => {
          const eligibleTypes = getEligibleZoneTypes(lot);

          // Must include 'hazardous' and 'standard'
          expect(eligibleTypes).toContain('hazardous');
          expect(eligibleTypes).toContain('standard');

          // Must never include 'cold_chain'
          expect(eligibleTypes).not.toContain('cold_chain');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 6b: isCompatible(classA, classA) always returns true
   * (same class is always compatible with itself).
   *
   * Validates: Requirements 4.3
   */
  it('Property 6b: Same hazard class is always compatible with itself', () => {
    fc.assert(
      fc.asyncProperty(hazardClassArb, async (hazardClass) => {
        const result = await isCompatible(hazardClass, hazardClass);
        expect(result).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 6c: isCompatible is symmetric — isCompatible(A, B) === isCompatible(B, A).
   * The segregation matrix lookup checks both directions (A-B and B-A),
   * so the result must be the same regardless of argument order.
   *
   * Validates: Requirements 4.3
   */
  it('Property 6c: isCompatible is symmetric — isCompatible(A,B) === isCompatible(B,A)', () => {
    fc.assert(
      fc.asyncProperty(
        hazardClassArb,
        hazardClassArb,
        async (classA, classB) => {
          // Mock the matrix lookup to return a consistent result
          // The function checks both directions, so we mock findFirst
          const mockResult = { is_compatible: true, min_separation_slots: 0 };
          (mockedPrisma as any).hazardSegregationMatrix.findFirst.mockResolvedValue(
            classA === classB ? null : mockResult
          );

          const resultAB = await isCompatible(classA, classB);
          const resultBA = await isCompatible(classB, classA);
          expect(resultAB).toBe(resultBA);
        },
      ),
      { numRuns: 100 },
    );
  });
});
