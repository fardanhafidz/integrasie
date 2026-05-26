/**
 * Property-Based Tests: Temperature Breach Classification
 *
 * Feature: integrasie-smart-dashboard, Property 7: Temperature Breach Classification
 *
 * Validates: Requirements 5.3
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock Prisma before importing the module under test to prevent DB initialization
vi.mock('@server/config/database', () => {
  return {
    prisma: {
      temperatureReading: { findMany: vi.fn(), findFirst: vi.fn() },
    },
  };
});

import { checkBreach, SAFE_TEMP_LIMIT } from '@server/modules/temperature/breachDetector';

describe('Feature: integrasie-smart-dashboard, Property 7: Temperature Breach Classification', () => {
  /**
   * Property 7a: For any temperature > -4.0, checkBreach returns true
   *
   * **Validates: Requirements 5.3**
   */
  it('Property 7a: any temperature > -4.0 is classified as a breach', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -4.0 + Number.EPSILON, max: 100, noNaN: true }),
        (temperature) => {
          // Only test values strictly greater than -4.0
          fc.pre(temperature > SAFE_TEMP_LIMIT);
          expect(checkBreach(temperature)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7b: For any temperature <= -4.0, checkBreach returns false
   *
   * **Validates: Requirements 5.3**
   */
  it('Property 7b: any temperature <= -4.0 is not classified as a breach', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: -4.0, noNaN: true }),
        (temperature) => {
          // Only test values at or below -4.0
          fc.pre(temperature <= SAFE_TEMP_LIMIT);
          expect(checkBreach(temperature)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7c: checkBreach(-4.0) is always false (boundary)
   *
   * **Validates: Requirements 5.3**
   */
  it('Property 7c: the boundary value -4.0 is always classified as safe (not a breach)', () => {
    fc.assert(
      fc.property(
        fc.constant(-4.0),
        (temperature) => {
          expect(checkBreach(temperature)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7d: The classification is deterministic — same input always gives same output
   *
   * **Validates: Requirements 5.3**
   */
  it('Property 7d: classification is deterministic — same input always produces same output', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        (temperature) => {
          const result1 = checkBreach(temperature);
          const result2 = checkBreach(temperature);
          const result3 = checkBreach(temperature);
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      ),
      { numRuns: 100 }
    );
  });
});
