import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  matchRoute,
  isFactoryManager,
  getAllowedRoutes,
  ROLE_PERMISSIONS,
  AUTH_ROUTES,
} from '../../src/server/shared/permissions';
import { UserRole } from '../../src/server/shared/types';

describe('Permissions - matchRoute', () => {
  it('should match exact routes', () => {
    expect(matchRoute('/api/intakes', '/api/intakes')).toBe(true);
    expect(matchRoute('/api/audit', '/api/audit')).toBe(true);
  });

  it('should not match different routes', () => {
    expect(matchRoute('/api/intakes', '/api/audit')).toBe(false);
    expect(matchRoute('/api/lots', '/api/intakes')).toBe(false);
  });

  it('should match routes with path parameters', () => {
    expect(matchRoute('/api/qc/:lotId/result', '/api/qc/abc-123/result')).toBe(true);
    expect(matchRoute('/api/intakes/:id', '/api/intakes/some-uuid')).toBe(true);
    expect(matchRoute('/api/lots/:id', '/api/lots/lot-uuid-here')).toBe(true);
  });

  it('should not match path params with extra segments', () => {
    expect(matchRoute('/api/qc/:lotId/result', '/api/qc/abc/result/extra')).toBe(false);
  });

  it('should match wildcard routes', () => {
    expect(matchRoute('/api/slotting/*', '/api/slotting/lot-123/recommendations')).toBe(true);
    expect(matchRoute('/api/slotting/*', '/api/slotting/lot-123/assign')).toBe(true);
    expect(matchRoute('/api/temperature/*', '/api/temperature/current')).toBe(true);
    expect(matchRoute('/api/temperature/*', '/api/temperature/history/zone-1')).toBe(true);
    expect(matchRoute('/api/ppic/*', '/api/ppic/stock')).toBe(true);
    expect(matchRoute('/api/ppic/*', '/api/ppic/schedules')).toBe(true);
  });

  it('should not match wildcard routes for different prefixes', () => {
    expect(matchRoute('/api/slotting/*', '/api/temperature/current')).toBe(false);
    expect(matchRoute('/api/ppic/*', '/api/audit')).toBe(false);
  });

  it('should handle trailing slashes', () => {
    expect(matchRoute('/api/intakes/', '/api/intakes')).toBe(true);
    expect(matchRoute('/api/intakes', '/api/intakes/')).toBe(true);
  });
});

describe('Permissions - hasPermission', () => {
  describe('Auth routes (all roles)', () => {
    const allRoles = [
      UserRole.WAREHOUSE_OPERATOR,
      UserRole.QC_STAFF,
      UserRole.PPIC_TEAM,
      UserRole.FACTORY_MANAGER,
    ];

    it('should allow all roles to access auth routes', () => {
      for (const role of allRoles) {
        expect(hasPermission(role, 'POST', '/api/auth/login')).toBe(true);
        expect(hasPermission(role, 'POST', '/api/auth/refresh')).toBe(true);
        expect(hasPermission(role, 'POST', '/api/auth/logout')).toBe(true);
      }
    });
  });

  describe('Warehouse_Operator permissions', () => {
    const role = UserRole.WAREHOUSE_OPERATOR;

    it('should allow access to supplier intake routes', () => {
      expect(hasPermission(role, 'POST', '/api/intakes')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/intakes')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/intakes/some-id')).toBe(true);
    });

    it('should allow access to lots and ready-to-store', () => {
      expect(hasPermission(role, 'GET', '/api/lots')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/lots/ready-to-store')).toBe(true);
    });

    it('should allow access to smart slotting routes', () => {
      expect(hasPermission(role, 'GET', '/api/slotting/lot-123/recommendations')).toBe(true);
      expect(hasPermission(role, 'POST', '/api/slotting/lot-123/assign')).toBe(true);
      expect(hasPermission(role, 'POST', '/api/slotting/lot-123/override')).toBe(true);
    });

    it('should allow access to temperature routes', () => {
      expect(hasPermission(role, 'GET', '/api/temperature/current')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/temperature/history/zone-1')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/temperature/breaches')).toBe(true);
    });

    it('should deny access to audit trail', () => {
      expect(hasPermission(role, 'GET', '/api/audit')).toBe(false);
    });

    it('should deny access to PPIC routes', () => {
      expect(hasPermission(role, 'GET', '/api/ppic/stock')).toBe(false);
      expect(hasPermission(role, 'POST', '/api/ppic/schedules')).toBe(false);
    });

    it('should deny access to notification config', () => {
      expect(hasPermission(role, 'GET', '/api/notifications/config')).toBe(false);
      expect(hasPermission(role, 'PUT', '/api/notifications/config')).toBe(false);
    });

    it('should deny access to QC submission', () => {
      expect(hasPermission(role, 'POST', '/api/qc/lot-123/result')).toBe(false);
    });
  });

  describe('QC_Staff permissions', () => {
    const role = UserRole.QC_STAFF;

    it('should allow access to pending QC queue', () => {
      expect(hasPermission(role, 'GET', '/api/lots/pending-qc')).toBe(true);
    });

    it('should allow access to QC result submission', () => {
      expect(hasPermission(role, 'POST', '/api/qc/lot-123/result')).toBe(true);
    });

    it('should allow access to QC history', () => {
      expect(hasPermission(role, 'GET', '/api/qc/lot-123/history')).toBe(true);
    });

    it('should allow access to lots list', () => {
      expect(hasPermission(role, 'GET', '/api/lots')).toBe(true);
    });

    it('should deny access to supplier intake creation', () => {
      expect(hasPermission(role, 'POST', '/api/intakes')).toBe(false);
    });

    it('should deny access to smart slotting', () => {
      expect(hasPermission(role, 'GET', '/api/slotting/lot-123/recommendations')).toBe(false);
      expect(hasPermission(role, 'POST', '/api/slotting/lot-123/assign')).toBe(false);
    });

    it('should deny access to audit trail', () => {
      expect(hasPermission(role, 'GET', '/api/audit')).toBe(false);
    });

    it('should deny access to PPIC routes', () => {
      expect(hasPermission(role, 'GET', '/api/ppic/stock')).toBe(false);
    });

    it('should deny access to notification config', () => {
      expect(hasPermission(role, 'GET', '/api/notifications/config')).toBe(false);
    });
  });

  describe('PPIC_Team permissions', () => {
    const role = UserRole.PPIC_TEAM;

    it('should allow access to PPIC stock dashboard', () => {
      expect(hasPermission(role, 'GET', '/api/ppic/stock')).toBe(true);
    });

    it('should allow access to PPIC schedules', () => {
      expect(hasPermission(role, 'POST', '/api/ppic/schedules')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/ppic/schedules')).toBe(true);
    });

    it('should allow access to PPIC work orders', () => {
      expect(hasPermission(role, 'POST', '/api/ppic/work-orders')).toBe(true);
    });

    it('should allow access to lots list', () => {
      expect(hasPermission(role, 'GET', '/api/lots')).toBe(true);
    });

    it('should deny access to supplier intake', () => {
      expect(hasPermission(role, 'POST', '/api/intakes')).toBe(false);
      expect(hasPermission(role, 'GET', '/api/intakes')).toBe(false);
    });

    it('should deny access to smart slotting', () => {
      expect(hasPermission(role, 'GET', '/api/slotting/lot-123/recommendations')).toBe(false);
    });

    it('should deny access to QC routes', () => {
      expect(hasPermission(role, 'POST', '/api/qc/lot-123/result')).toBe(false);
    });

    it('should deny access to audit trail', () => {
      expect(hasPermission(role, 'GET', '/api/audit')).toBe(false);
    });

    it('should deny access to notification config', () => {
      expect(hasPermission(role, 'GET', '/api/notifications/config')).toBe(false);
    });
  });

  describe('Factory_Manager permissions (super admin)', () => {
    const role = UserRole.FACTORY_MANAGER;

    it('should allow access to ALL routes', () => {
      // Intake
      expect(hasPermission(role, 'POST', '/api/intakes')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/intakes')).toBe(true);
      // Lots
      expect(hasPermission(role, 'GET', '/api/lots')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/lots/pending-qc')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/lots/ready-to-store')).toBe(true);
      // QC
      expect(hasPermission(role, 'POST', '/api/qc/lot-123/result')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/qc/lot-123/history')).toBe(true);
      // Slotting
      expect(hasPermission(role, 'GET', '/api/slotting/lot-123/recommendations')).toBe(true);
      expect(hasPermission(role, 'POST', '/api/slotting/lot-123/assign')).toBe(true);
      // Temperature
      expect(hasPermission(role, 'GET', '/api/temperature/current')).toBe(true);
      expect(hasPermission(role, 'GET', '/api/temperature/breaches')).toBe(true);
      // Audit
      expect(hasPermission(role, 'GET', '/api/audit')).toBe(true);
      // PPIC
      expect(hasPermission(role, 'GET', '/api/ppic/stock')).toBe(true);
      expect(hasPermission(role, 'POST', '/api/ppic/schedules')).toBe(true);
      // Notifications
      expect(hasPermission(role, 'GET', '/api/notifications/config')).toBe(true);
      expect(hasPermission(role, 'PUT', '/api/notifications/config')).toBe(true);
    });
  });
});

describe('Permissions - isFactoryManager', () => {
  it('should return true for Factory_Manager role', () => {
    expect(isFactoryManager(UserRole.FACTORY_MANAGER)).toBe(true);
  });

  it('should return false for other roles', () => {
    expect(isFactoryManager(UserRole.WAREHOUSE_OPERATOR)).toBe(false);
    expect(isFactoryManager(UserRole.QC_STAFF)).toBe(false);
    expect(isFactoryManager(UserRole.PPIC_TEAM)).toBe(false);
  });
});

describe('Permissions - getAllowedRoutes', () => {
  it('should return permissions for Warehouse_Operator', () => {
    const routes = getAllowedRoutes(UserRole.WAREHOUSE_OPERATOR);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.some((r) => r.route === '/api/intakes')).toBe(true);
    expect(routes.some((r) => r.route === '/api/slotting/*')).toBe(true);
  });

  it('should return permissions for QC_Staff', () => {
    const routes = getAllowedRoutes(UserRole.QC_STAFF);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.some((r) => r.route === '/api/lots/pending-qc')).toBe(true);
    expect(routes.some((r) => r.route === '/api/qc/:lotId/result')).toBe(true);
  });

  it('should return permissions for PPIC_Team', () => {
    const routes = getAllowedRoutes(UserRole.PPIC_TEAM);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.some((r) => r.route === '/api/ppic/*')).toBe(true);
  });

  it('should return all permissions for Factory_Manager', () => {
    const routes = getAllowedRoutes(UserRole.FACTORY_MANAGER);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.some((r) => r.route === '/api/audit')).toBe(true);
    expect(routes.some((r) => r.route === '/api/notifications/config')).toBe(true);
  });
});

describe('Permissions - ROLE_PERMISSIONS structure', () => {
  it('should have entries for all four roles', () => {
    expect(ROLE_PERMISSIONS[UserRole.WAREHOUSE_OPERATOR]).toBeDefined();
    expect(ROLE_PERMISSIONS[UserRole.QC_STAFF]).toBeDefined();
    expect(ROLE_PERMISSIONS[UserRole.PPIC_TEAM]).toBeDefined();
    expect(ROLE_PERMISSIONS[UserRole.FACTORY_MANAGER]).toBeDefined();
  });

  it('should have valid HTTP methods in all permissions', () => {
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    for (const role of Object.values(UserRole)) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        for (const method of perm.methods) {
          expect(validMethods).toContain(method);
        }
      }
    }
  });

  it('should have all routes starting with /api/', () => {
    for (const role of Object.values(UserRole)) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(perm.route.startsWith('/api/')).toBe(true);
      }
    }
  });
});

describe('Permissions - AUTH_ROUTES', () => {
  it('should define login, refresh, and logout routes', () => {
    expect(AUTH_ROUTES).toHaveLength(3);
    expect(AUTH_ROUTES.some((r) => r.route === '/api/auth/login')).toBe(true);
    expect(AUTH_ROUTES.some((r) => r.route === '/api/auth/refresh')).toBe(true);
    expect(AUTH_ROUTES.some((r) => r.route === '/api/auth/logout')).toBe(true);
  });

  it('should only allow POST method for auth routes', () => {
    for (const route of AUTH_ROUTES) {
      expect(route.methods).toEqual(['POST']);
    }
  });
});
