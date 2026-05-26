// Shared validation schemas (Zod) - will be populated as modules are implemented
import { z } from 'zod';

export const emailSchema = z.string().email('Invalid email format');

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
