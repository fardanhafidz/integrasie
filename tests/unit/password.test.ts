import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, validatePassword } from '@server/shared/password';

describe('Password Utility', () => {
  describe('hashPassword', () => {
    it('should return a bcrypt hash string', async () => {
      const hash = await hashPassword('ValidPass1');
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    });

    it('should produce different hashes for the same password (due to salt)', async () => {
      const hash1 = await hashPassword('ValidPass1');
      const hash2 = await hashPassword('ValidPass1');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password and hash', async () => {
      const password = 'SecurePass123';
      const hash = await hashPassword(password);
      const result = await comparePassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const hash = await hashPassword('SecurePass123');
      const result = await comparePassword('WrongPassword1', hash);
      expect(result).toBe(false);
    });

    it('should return false for empty password against a valid hash', async () => {
      const hash = await hashPassword('SecurePass123');
      const result = await comparePassword('', hash);
      expect(result).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should accept a valid password', () => {
      const result = validatePassword('ValidPass1');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password shorter than 8 characters', () => {
      const result = validatePassword('Ab1cdef');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase letter', () => {
      const result = validatePassword('lowercase1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase letter', () => {
      const result = validatePassword('UPPERCASE1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without a number', () => {
      const result = validatePassword('NoNumberHere');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should return multiple errors for a password violating multiple rules', () => {
      const result = validatePassword('short');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should accept a password that is exactly 8 characters', () => {
      const result = validatePassword('Abcdefg1');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
