/**
 * Property-Based Test: Role-Permission Invariant
 *
 * Feature: integrasie-smart-dashboard, Property 1: Role-Permission Invariant
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7
 *
 * Property: For any user in the system with role R, that user can only access
 * resources in the permission set defined for R. No request from a user with
 * role R succeeds for a resource outside that permission set.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  hasPermission,
  ROLE_PERMISSIONS,
  AUTH_ROUTES,
  matchRoute,
  type HttpMethod,
} from '@server/shared/permissions';
import { UserRole } from '@server/shared/types';

// All valid roles
const ALL_ROLES = Object.values(UserRole);

// All valid HTTP methods
const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Non-Factory_Manager roles (for testing restricted access)
const NON_MANAGER_ROLES = ALL_ROLES.filter(
  (r) => r !== UserRole.FACTORY_MANAGER
);

/**
 * Generates a concrete path from a route pattern by replacing
 * :param segments with random UUIDs and /* wildcards with random sub-paths.
 */
function concretizePath(pattern: string): fc.Arbitrary<string> {
  // Handle wildcard patterns
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return fc
      .stringMatching(/^[a-z0-9-]+$/)
      .filter((s) => s.length > 0 && s.length <= 30)
      .map((segment) => `${prefix}/${segment}`);
  }

  // Handle :param patterns
  const parts = pattern.split('/');
  const arbitraries = parts.map((part) => {
    if (part.startsWith(':')) {
      // Generate a UUID-like string for path params
      return fc
        .stringMatching(/^[a-f0-9-]+$/)
        .filter((s) => s.length >= 4 && s.length <= 36);
    }
    return fc.constant(part);
  });

  return fc.tuple(...arbitraries).map((segments) => segments.join('/'));
}

/**
 * Generates a random route path that does NOT match any permission
 * for a given role and is NOT an auth route.
 */
function generateUnauthorizedPath(): fc.Arbitrary<string> {
  // Generate paths that are clearly outside any defined permission
  const unauthorizedPrefixes = [
    '/api/admin/settings',
    '/api/admin/users',
    '/api/reports/financial',
    '/api/system/config',
    '/api/unknown/resource',
    '/api/forbidden/endpoint',
    '/api/secret/data',
  ];

  return fc.constantFrom(...unauthorizedPrefixes).chain((prefix) =>
    fc
      .stringMatching(/^[a-z0-9-]+$/)
      .filter((s) => s.length > 0 && s.length <= 20)
      .map((suffix) => `${prefix}/${suffix}`)
  );
}

// Arbitrary for roles
const roleArb = fc.constantFrom(...ALL_ROLES);
const nonManagerRoleArb = fc.constantFrom(...NON_MANAGER_ROLES);
const methodArb = fc.constantFrom(...ALL_METHODS);

describe('Feature: integrasie-smart-dashboard, Property 1: Role-Permission Invariant', () => {
  /**
   * Property 1a: For any role R and any route in ROLE_PERMISSIONS[R],
   * hasPermission returns true.
   *
   * Validates: Requirements 1.3, 1.4, 1.5, 1.6
   */
  it('Property 1a: hasPermission returns true for any role accessing its own permitted routes', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const permissions = ROLE_PERMISSIONS[role];

        for (const perm of permissions) {
          for (const method of perm.methods) {
            // Generate a concrete path from the route pattern
            const concretePath = generateConcretePath(perm.route);
            const result = hasPermission(role, method, concretePath);
            expect(result).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1b: For any non-Factory_Manager role R and any route NOT in
   * ROLE_PERMISSIONS[R] (and not in AUTH_ROUTES), hasPermission returns false.
   *
   * Validates: Requirements 1.3, 1.4, 1.5, 1.7
   */
  it('Property 1b: hasPermission returns false for non-Factory_Manager roles accessing routes outside their permissions', () => {
    fc.assert(
      fc.property(
        nonManagerRoleArb,
        methodArb,
        generateUnauthorizedPath(),
        (role, method, path) => {
          // Verify the path is not an auth route
          const isAuthRoute = AUTH_ROUTES.some(
            (perm) =>
              matchRoute(perm.route, path) && perm.methods.includes(method)
          );

          // Verify the path is not in the role's permissions
          const isInRolePerms = ROLE_PERMISSIONS[role].some(
            (perm) =>
              matchRoute(perm.route, path) && perm.methods.includes(method)
          );

          // Only test if path is truly unauthorized
          if (!isAuthRoute && !isInRolePerms) {
            const result = hasPermission(role, method, path);
            expect(result).toBe(false);
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1c: Factory_Manager always returns true for any valid route.
   *
   * Validates: Requirements 1.6
   */
  it('Property 1c: Factory_Manager always has permission for any valid route', () => {
    // Collect all known routes from all roles
    const allRoutes: { route: string; methods: HttpMethod[] }[] = [];
    for (const role of ALL_ROLES) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        allRoutes.push(perm);
      }
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...allRoutes),
        (perm) => {
          for (const method of perm.methods) {
            const concretePath = generateConcretePath(perm.route);
            const result = hasPermission(
              UserRole.FACTORY_MANAGER,
              method,
              concretePath
            );
            expect(result).toBe(true);
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 1d: Auth routes always return true for any role.
   *
   * Validates: Requirements 1.3, 1.4, 1.5, 1.6
   */
  it('Property 1d: Auth routes are accessible by any authenticated role', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        for (const authRoute of AUTH_ROUTES) {
          for (const method of authRoute.methods) {
            const concretePath = generateConcretePath(authRoute.route);
            const result = hasPermission(role, method, concretePath);
            expect(result).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Additional property: Cross-role isolation - routes exclusive to one role
   * are denied for other non-manager roles.
   *
   * Validates: Requirements 1.3, 1.4, 1.5, 1.7
   */
  it('Property 1e: Routes exclusive to one role are denied for other non-manager roles', () => {
    fc.assert(
      fc.property(nonManagerRoleArb, (role) => {
        // For each other non-manager role, check their exclusive routes
        for (const otherRole of NON_MANAGER_ROLES) {
          if (otherRole === role) continue;

          const otherPermissions = ROLE_PERMISSIONS[otherRole];
          for (const perm of otherPermissions) {
            for (const method of perm.methods) {
              const concretePath = generateConcretePath(perm.route);

              // Check if this route is also in the current role's permissions
              const isAlsoPermitted = ROLE_PERMISSIONS[role].some(
                (p) =>
                  matchRoute(p.route, concretePath) &&
                  p.methods.includes(method)
              );

              // Check if it's an auth route
              const isAuthRoute = AUTH_ROUTES.some(
                (p) =>
                  matchRoute(p.route, concretePath) &&
                  p.methods.includes(method)
              );

              // If not permitted for this role and not an auth route, should be denied
              if (!isAlsoPermitted && !isAuthRoute) {
                const result = hasPermission(role, method, concretePath);
                expect(result).toBe(false);
              }
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Helper: Generate a concrete path from a route pattern deterministically.
 * Replaces :param with a sample UUID and handles /* wildcards.
 */
function generateConcretePath(pattern: string): string {
  // Handle wildcard patterns
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return `${prefix}/test-resource`;
  }

  // Handle :param patterns
  return pattern.replace(/:([a-zA-Z]+)/g, 'sample-id-12345');
}
