/**
 * Property-Based Tests: Notification Retry Logic
 *
 * Feature: integrasie-smart-dashboard, Property 11: Notification Retry Logic
 *
 * Validates: Requirements 7.4
 *
 * "For any WhatsApp delivery failure, the system retries exactly up to 3 times
 * with 10-second intervals. After 3 failures, the failure is logged in the audit trail."
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { WhatsAppSendResult } from '@server/modules/notification/whatsappGateway';

// Mock the whatsappGateway module before any imports that use it
vi.mock('@server/modules/notification/whatsappGateway', () => ({
  sendWhatsAppMessage: vi.fn<() => Promise<WhatsAppSendResult>>().mockResolvedValue({
    success: false,
    error: 'default mock',
  }),
}));

// Mock Socket.IO to prevent initialization errors
vi.mock('@server/index', () => ({
  io: { emit: vi.fn() },
}));

// Mock Prisma
vi.mock('@server/config/database', () => ({
  prisma: {},
}));

import { sendAlertWithRetry } from '@server/modules/notification/notification.service';
import { sendWhatsAppMessage } from '@server/modules/notification/whatsappGateway';

const mockedSendWhatsApp = vi.mocked(sendWhatsAppMessage);

// Generator for valid E.164 phone numbers
const phoneNumberArb = fc.integer({ min: 1000000000, max: 9999999999 }).map(
  (n) => `+62${n}`
);

describe('Feature: integrasie-smart-dashboard, Property 11: Notification Retry Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Helper: runs sendAlertWithRetry while advancing fake timers for delays.
   * Since delay uses setTimeout, we need to flush timers after each await.
   */
  async function runWithTimers(
    recipients: string[],
    message: string,
    maxRetries: number,
    retryIntervalMs: number
  ) {
    const promise = sendAlertWithRetry(recipients, message, maxRetries, retryIntervalMs);
    // Advance timers repeatedly to resolve all delays
    for (let i = 0; i < recipients.length * maxRetries; i++) {
      await vi.advanceTimersByTimeAsync(retryIntervalMs + 1);
    }
    return promise;
  }

  /**
   * Property 11a: For any number of recipients and any failure pattern,
   * the total attempts per recipient never exceeds maxRetries.
   *
   * **Validates: Requirements 7.4**
   */
  it('Property 11a: total attempts per recipient never exceeds maxRetries', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 unique recipients
        fc.uniqueArray(phoneNumberArb, { minLength: 1, maxLength: 5 }),
        // Generate maxRetries between 1 and 5
        fc.integer({ min: 1, max: 5 }),
        // Generate a failure pattern (array of booleans: true=success, false=fail)
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }),
        async (recipients, maxRetries, failurePattern) => {
          let callIndex = 0;
          mockedSendWhatsApp.mockImplementation(async () => {
            const shouldSucceed = failurePattern[callIndex % failurePattern.length];
            callIndex++;
            return shouldSucceed
              ? { success: true, messageId: `msg-${callIndex}` }
              : { success: false, error: 'Delivery failed' };
          });

          const result = await runWithTimers(recipients, 'Test alert', maxRetries, 10);

          // Total attempts should never exceed recipients * maxRetries
          expect(result.attempts).toBeLessThanOrEqual(recipients.length * maxRetries);
          // Total attempts should be at least the number of recipients (at least 1 attempt each)
          expect(result.attempts).toBeGreaterThanOrEqual(recipients.length);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 11b: For any recipient where all attempts fail,
   * that recipient appears in failedRecipients.
   *
   * **Validates: Requirements 7.4**
   */
  it('Property 11b: recipients with all failed attempts appear in failedRecipients', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 unique recipients
        fc.uniqueArray(phoneNumberArb, { minLength: 1, maxLength: 5 }),
        // Generate maxRetries between 1 and 5
        fc.integer({ min: 1, max: 5 }),
        async (recipients, maxRetries) => {
          // All attempts always fail
          mockedSendWhatsApp.mockImplementation(async () => ({
            success: false,
            error: 'Delivery failed',
          }));

          const result = await runWithTimers(recipients, 'Test alert', maxRetries, 10);

          // Every recipient should be in failedRecipients
          for (const recipient of recipients) {
            expect(result.failedRecipients).toContain(recipient);
          }
          // failedRecipients should have exactly the same count as recipients
          expect(result.failedRecipients.length).toBe(recipients.length);
          // success should be false
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 11c: For any recipient where at least one attempt succeeds,
   * that recipient does NOT appear in failedRecipients.
   *
   * **Validates: Requirements 7.4**
   */
  it('Property 11c: recipients with at least one successful attempt do NOT appear in failedRecipients', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 unique recipients
        fc.uniqueArray(phoneNumberArb, { minLength: 1, maxLength: 5 }),
        // Generate maxRetries between 1 and 5
        fc.integer({ min: 1, max: 5 }),
        // For each recipient, on which attempt it succeeds (1-based)
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 5, maxLength: 5 }),
        async (recipients, maxRetries, successAttempts) => {
          // For each recipient, determine on which attempt it succeeds (clamped to maxRetries)
          const successOnAttempt = recipients.map((_, i) =>
            Math.min(successAttempts[i % successAttempts.length], maxRetries)
          );

          // Build a flat sequence of results for all calls in order
          const results: WhatsAppSendResult[] = [];
          for (let r = 0; r < recipients.length; r++) {
            const succeedAt = successOnAttempt[r];
            for (let a = 1; a <= succeedAt; a++) {
              if (a === succeedAt) {
                results.push({ success: true, messageId: `msg-${r}-${a}` });
              } else {
                results.push({ success: false, error: 'Delivery failed' });
              }
            }
          }

          let callIdx = 0;
          mockedSendWhatsApp.mockImplementation(async () => {
            if (callIdx < results.length) {
              return results[callIdx++];
            }
            // Fallback: should not be reached, but return success to avoid false negatives
            return { success: true, messageId: 'fallback' };
          });

          const result = await runWithTimers(recipients, 'Test alert', maxRetries, 10);

          // No recipient should be in failedRecipients since all succeed within maxRetries
          expect(result.failedRecipients.length).toBe(0);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Property 11d: The total attempts count equals the sum of attempts across all recipients.
   *
   * **Validates: Requirements 7.4**
   */
  it('Property 11d: total attempts equals the sum of individual recipient attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 unique recipients
        fc.uniqueArray(phoneNumberArb, { minLength: 1, maxLength: 5 }),
        // Generate maxRetries between 1 and 5
        fc.integer({ min: 1, max: 5 }),
        // For each recipient, on which attempt it succeeds (0 = never succeeds)
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 5, maxLength: 5 }),
        async (recipients, maxRetries, successAttemptPattern) => {
          // For each recipient, determine on which attempt it succeeds (0 = never)
          const successOnAttempt = recipients.map((_, i) =>
            successAttemptPattern[i % successAttemptPattern.length]
          );

          // Build a flat sequence of results for all calls in order
          const results: WhatsAppSendResult[] = [];
          let expectedTotal = 0;

          for (let r = 0; r < recipients.length; r++) {
            const succeedAt = successOnAttempt[r];

            if (succeedAt > 0 && succeedAt <= maxRetries) {
              // Recipient succeeds on attempt `succeedAt`
              for (let a = 1; a <= succeedAt; a++) {
                if (a === succeedAt) {
                  results.push({ success: true, messageId: `msg-${r}-${a}` });
                } else {
                  results.push({ success: false, error: 'Delivery failed' });
                }
              }
              expectedTotal += succeedAt;
            } else {
              // Recipient never succeeds (all maxRetries attempts fail)
              for (let a = 1; a <= maxRetries; a++) {
                results.push({ success: false, error: 'Delivery failed' });
              }
              expectedTotal += maxRetries;
            }
          }

          let callIdx = 0;
          mockedSendWhatsApp.mockImplementation(async () => {
            if (callIdx < results.length) {
              return results[callIdx++];
            }
            // Fallback: should not be reached
            return { success: false, error: 'Unexpected call beyond expected count' };
          });

          const result = await runWithTimers(recipients, 'Test alert', maxRetries, 10);

          // Total attempts should match expected
          expect(result.attempts).toBe(expectedTotal);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});
