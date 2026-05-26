import { describe, it, expect } from 'vitest';

// Mock the database module to prevent Prisma client initialization
vi.mock('@server/config/database', () => ({
  prisma: {},
}));

import {
  formatCriticalAlert,
  formatTemperatureBreachAlert,
  formatSlottingFailureAlert,
  formatDeliveryFailureAlert,
  MAX_ALERT_LENGTH,
  type CriticalAlertParams,
} from '@server/modules/notification/alertFormatter';

describe('alertFormatter', () => {
  describe('formatCriticalAlert', () => {
    it('should format a complete alert with all fields', () => {
      const params: CriticalAlertParams = {
        severity: 'CRITICAL',
        eventType: 'TEMPERATURE BREACH',
        description: 'Temperature exceeded safe limit in cold storage',
        affectedArea: 'Cold Room A (zone-001)',
        currentReading: '-2.5°C',
        safeThreshold: '-4.0°C',
        recommendedAction: 'Investigate immediately and check cooling system',
      };

      const result = formatCriticalAlert(params);

      expect(result).toContain('[CRITICAL]');
      expect(result).toContain('TEMPERATURE BREACH');
      expect(result).toContain('Temperature exceeded safe limit in cold storage');
      expect(result).toContain('Cold Room A (zone-001)');
      expect(result).toContain('-2.5°C');
      expect(result).toContain('-4.0°C');
      expect(result).toContain('Investigate immediately and check cooling system');
    });

    it('should format alert without optional currentReading', () => {
      const params: CriticalAlertParams = {
        severity: 'HIGH',
        eventType: 'SLOTTING FAILURE',
        description: 'No available slot found',
        affectedArea: 'Warehouse Zone B',
        recommendedAction: 'Manual intervention required',
      };

      const result = formatCriticalAlert(params);

      expect(result).toContain('[HIGH]');
      expect(result).toContain('SLOTTING FAILURE');
      expect(result).not.toContain('Current Reading:');
      expect(result).not.toContain('Safe Threshold:');
      expect(result).toContain('Manual intervention required');
    });

    it('should format alert without optional safeThreshold', () => {
      const params: CriticalAlertParams = {
        severity: 'MEDIUM',
        eventType: 'SENSOR WARNING',
        description: 'Sensor intermittent',
        affectedArea: 'Zone C',
        currentReading: 'N/A',
        recommendedAction: 'Check sensor connection',
      };

      const result = formatCriticalAlert(params);

      expect(result).toContain('Current Reading: N/A');
      expect(result).not.toContain('Safe Threshold:');
    });

    it('should not exceed 1000 characters', () => {
      const params: CriticalAlertParams = {
        severity: 'CRITICAL',
        eventType: 'TEST EVENT',
        description: 'A'.repeat(500),
        affectedArea: 'B'.repeat(300),
        currentReading: 'C'.repeat(100),
        safeThreshold: 'D'.repeat(100),
        recommendedAction: 'E'.repeat(200),
      };

      const result = formatCriticalAlert(params);

      expect(result.length).toBeLessThanOrEqual(MAX_ALERT_LENGTH);
    });

    it('should truncate message at exactly 1000 characters when exceeding limit', () => {
      const params: CriticalAlertParams = {
        severity: 'CRITICAL',
        eventType: 'OVERFLOW TEST',
        description: 'X'.repeat(900),
        affectedArea: 'Y'.repeat(200),
        recommendedAction: 'Z'.repeat(200),
      };

      const result = formatCriticalAlert(params);

      expect(result.length).toBe(MAX_ALERT_LENGTH);
    });

    it('should include severity levels correctly', () => {
      const severities: Array<'CRITICAL' | 'HIGH' | 'MEDIUM'> = [
        'CRITICAL',
        'HIGH',
        'MEDIUM',
      ];

      for (const severity of severities) {
        const result = formatCriticalAlert({
          severity,
          eventType: 'TEST',
          description: 'Test description',
          affectedArea: 'Test area',
          recommendedAction: 'Test action',
        });

        expect(result).toContain(`[${severity}]`);
      }
    });

    it('should separate fields with newlines', () => {
      const params: CriticalAlertParams = {
        severity: 'HIGH',
        eventType: 'TEST',
        description: 'desc',
        affectedArea: 'area',
        currentReading: 'reading',
        safeThreshold: 'threshold',
        recommendedAction: 'action',
      };

      const result = formatCriticalAlert(params);
      const lines = result.split('\n');

      expect(lines.length).toBe(6);
      expect(lines[0]).toContain('[HIGH] TEST');
      expect(lines[1]).toBe('Description: desc');
      expect(lines[2]).toBe('Affected Area: area');
      expect(lines[3]).toBe('Current Reading: reading');
      expect(lines[4]).toBe('Safe Threshold: threshold');
      expect(lines[5]).toBe('Recommended Action: action');
    });
  });

  describe('formatTemperatureBreachAlert', () => {
    it('should delegate to formatBreachAlert and return a valid message', () => {
      const result = formatTemperatureBreachAlert('Cold Room A', 'zone-001', -2.5);

      expect(result).toContain('Cold Room A');
      expect(result).toContain('zone-001');
      expect(result).toContain('-2.5');
      expect(result).toContain('-4.0');
    });

    it('should not exceed 1000 characters', () => {
      const result = formatTemperatureBreachAlert(
        'Very Long Zone Name That Goes On And On',
        'zone-with-a-very-long-identifier-string',
        99.9
      );

      expect(result.length).toBeLessThanOrEqual(MAX_ALERT_LENGTH);
    });

    it('should include temperature breach indicator', () => {
      const result = formatTemperatureBreachAlert('Zone X', 'zone-x', 5.0);

      expect(result).toContain('TEMPERATURE BREACH');
    });
  });

  describe('formatSlottingFailureAlert', () => {
    it('should format a slotting failure alert with lot details', () => {
      const result = formatSlottingFailureAlert(
        'lot-uuid-123',
        'CHM-20250525-0001',
        'All cold chain slots occupied'
      );

      expect(result).toContain('[HIGH]');
      expect(result).toContain('SLOTTING FAILURE');
      expect(result).toContain('CHM-20250525-0001');
      expect(result).toContain('lot-uuid-123');
      expect(result).toContain('All cold chain slots occupied');
    });

    it('should include recommended action with reason', () => {
      const result = formatSlottingFailureAlert(
        'lot-456',
        'RM-20250101-0002',
        'Hazard incompatibility with adjacent slots'
      );

      expect(result).toContain('Manual intervention required');
      expect(result).toContain('Hazard incompatibility with adjacent slots');
    });

    it('should not exceed 1000 characters', () => {
      const result = formatSlottingFailureAlert(
        'a'.repeat(100),
        'b'.repeat(100),
        'c'.repeat(500)
      );

      expect(result.length).toBeLessThanOrEqual(MAX_ALERT_LENGTH);
    });

    it('should use HIGH severity', () => {
      const result = formatSlottingFailureAlert('lot-1', 'LOT-001', 'reason');

      expect(result).toContain('[HIGH]');
    });
  });

  describe('formatDeliveryFailureAlert', () => {
    it('should format a delivery failure alert with category and recipients', () => {
      const result = formatDeliveryFailureAlert(
        'temperature_breach',
        ['+6281234567890', '+6289876543210'],
        3
      );

      expect(result).toContain('[CRITICAL]');
      expect(result).toContain('WHATSAPP DELIVERY FAILURE');
      expect(result).toContain('temperature_breach');
      expect(result).toContain('+6281234567890');
      expect(result).toContain('+6289876543210');
      expect(result).toContain('3 attempts');
    });

    it('should include recommended action about gateway connectivity', () => {
      const result = formatDeliveryFailureAlert(
        'slotting_failure',
        ['+1234567890'],
        3
      );

      expect(result).toContain('WhatsApp gateway connectivity');
      expect(result).toContain('Twilio API credentials');
    });

    it('should not exceed 1000 characters even with many recipients', () => {
      const manyRecipients = Array.from(
        { length: 20 },
        (_, i) => `+628${String(i).padStart(10, '0')}`
      );

      const result = formatDeliveryFailureAlert(
        'temperature_breach',
        manyRecipients,
        3
      );

      expect(result.length).toBeLessThanOrEqual(MAX_ALERT_LENGTH);
    });

    it('should use CRITICAL severity', () => {
      const result = formatDeliveryFailureAlert('test', ['+1234567890'], 3);

      expect(result).toContain('[CRITICAL]');
    });

    it('should handle single recipient', () => {
      const result = formatDeliveryFailureAlert(
        'temperature_breach',
        ['+6281234567890'],
        1
      );

      expect(result).toContain('+6281234567890');
      expect(result).toContain('1 attempts');
    });
  });
});
