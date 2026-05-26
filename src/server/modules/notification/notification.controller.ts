/**
 * Notification Controller
 *
 * Handles HTTP request/response for notification configuration endpoints.
 * Allows Factory_Manager to configure recipient phone numbers per alert category.
 *
 * Validates: Requirements 7.5, 7.6
 */

import { Request, Response } from 'express';
import { prisma } from '../../config/database';

/** E.164 phone number format regex */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

interface RecipientInput {
  userId: string;
  phoneNumber: string;
}

interface UpdateConfigBody {
  category: string;
  recipients: RecipientInput[];
}

/**
 * GET /api/notifications/config
 *
 * Retrieves all notification configurations grouped by alert_category.
 * Only accessible by Factory_Manager.
 *
 * Response: 200 { data: { [category]: Array<{ id, userId, phoneNumber, isActive }> } }
 */
export async function getConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const configs = await prisma.notificationConfig.findMany({
      where: { is_active: true },
      select: {
        id: true,
        alert_category: true,
        user_id: true,
        phone_number: true,
        is_active: true,
      },
      orderBy: { alert_category: 'asc' },
    });

    // Group by alert_category
    const grouped: Record<string, Array<{ id: string; userId: string; phoneNumber: string; isActive: boolean }>> = {};

    for (const config of configs) {
      if (!grouped[config.alert_category]) {
        grouped[config.alert_category] = [];
      }
      grouped[config.alert_category].push({
        id: config.id,
        userId: config.user_id,
        phoneNumber: config.phone_number,
        isActive: config.is_active,
      });
    }

    res.status(200).json({ data: grouped });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}

/**
 * PUT /api/notifications/config
 *
 * Updates notification configuration for a specific alert category.
 * Validates E.164 phone number format and requires at least one recipient.
 * Upserts notification_config records (deactivates old ones, creates new).
 *
 * Body: { category: string, recipients: Array<{ userId: string, phoneNumber: string }> }
 *
 * Response:
 * - 200 { message: 'Configuration updated successfully', data: { category, recipients } }
 * - 400 { error: 'Validation error', message: string, details?: string[] }
 */
export async function updateConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as UpdateConfigBody;

    // Validate required fields
    if (!body.category || typeof body.category !== 'string' || body.category.trim().length === 0) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Category is required and must be a non-empty string',
      });
      return;
    }

    if (!Array.isArray(body.recipients)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Recipients must be an array',
      });
      return;
    }

    // Require at least one recipient per category
    if (body.recipients.length === 0) {
      res.status(400).json({
        error: 'Validation error',
        message: 'At least one recipient is required per category',
      });
      return;
    }

    // Validate each recipient's phone number is E.164 format
    const validationErrors: string[] = [];
    for (let i = 0; i < body.recipients.length; i++) {
      const recipient = body.recipients[i];

      if (!recipient.userId || typeof recipient.userId !== 'string') {
        validationErrors.push(`Recipient ${i + 1}: userId is required`);
        continue;
      }

      if (!recipient.phoneNumber || typeof recipient.phoneNumber !== 'string') {
        validationErrors.push(`Recipient ${i + 1}: phoneNumber is required`);
        continue;
      }

      if (!E164_REGEX.test(recipient.phoneNumber)) {
        validationErrors.push(
          `Recipient ${i + 1}: phoneNumber "${recipient.phoneNumber}" is not valid E.164 format (must match +[1-9]\\d{1,14})`
        );
      }
    }

    if (validationErrors.length > 0) {
      res.status(400).json({
        error: 'Validation error',
        message: 'One or more recipients have invalid phone numbers',
        details: validationErrors,
      });
      return;
    }

    const category = body.category.trim();

    // Upsert: deactivate existing configs for this category, then create new ones
    await prisma.$transaction(async (tx) => {
      // Deactivate all existing configs for this category
      await tx.notificationConfig.updateMany({
        where: { alert_category: category },
        data: { is_active: false },
      });

      // Create new configs for each recipient
      await tx.notificationConfig.createMany({
        data: body.recipients.map((recipient) => ({
          alert_category: category,
          user_id: recipient.userId,
          phone_number: recipient.phoneNumber,
          is_active: true,
        })),
      });
    });

    // Re-read to return the actual saved state
    const savedConfigs = await prisma.notificationConfig.findMany({
      where: { alert_category: category, is_active: true },
      select: {
        id: true,
        user_id: true,
        phone_number: true,
        is_active: true,
      },
    });

    res.status(200).json({
      message: 'Configuration updated successfully',
      data: {
        category,
        recipients: savedConfigs.map((c) => ({
          id: c.id,
          userId: c.user_id,
          phoneNumber: c.phone_number,
          isActive: c.is_active,
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    res.status(500).json({
      error: 'Internal server error',
      message,
    });
  }
}
