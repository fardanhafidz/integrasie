/**
 * Role-Permission Mapping for IntegraSiE Smart Dashboard
 *
 * Defines which API routes and HTTP methods each role is allowed to access.
 * Factory_Manager has access to all routes (super admin).
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6
 */

import { UserRole } from './types';

/** HTTP methods used in route permissions */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A single permission entry mapping a route pattern to allowed HTTP methods */
export interface Permission {
  /** Route pattern (supports wildcard * for path segments, :param for path params) */
  route: string;
  /** Allowed HTTP methods for this route */
  methods: HttpMethod[];
}

/**
 * Checks if a request path matches a route pattern.
 * Supports:
 * - Exact matches: /api/auth/login
 * - Path parameters: /api/qc/:lotId/result
 * - Wildcards: /api/slotting/* (matches any sub-path)
 */
export function matchRoute(pattern: string, path: string): boolean {
  // Normalize paths - remove trailing slashes
  const normalizedPattern = pattern.replace(/\/+$/, '');
  const normalizedPath = path.replace(/\/+$/, '');

  // Handle wildcard patterns (e.g., /api/slotting/*)
  if (normalizedPattern.endsWith('/*')) {
    const prefix = normalizedPattern.slice(0, -2);
    return normalizedPath === prefix || normalizedPath.startsWith(prefix + '/');
  }

  const patternParts = normalizedPattern.split('/');
  const pathParts = normalizedPath.split('/');

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  return patternParts.every((part, index) => {
    // :param matches any single path segment
    if (part.startsWith(':')) {
      return true;
    }
    return part === pathParts[index];
  });
}

/**
 * Auth routes accessible by all authenticated users.
 * These are checked separately from role-specific permissions.
 */
export const AUTH_ROUTES: Permission[] = [
  { route: '/api/auth/login', methods: ['POST'] },
  { route: '/api/auth/refresh', methods: ['POST'] },
  { route: '/api/auth/logout', methods: ['POST'] },
];

/**
 * Role-specific permission mappings.
 * Each role maps to an array of Permission entries defining allowed routes and methods.
 *
 * Factory_Manager has access to ALL routes (defined separately as a super admin flag).
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.WAREHOUSE_OPERATOR]: [
    // Supplier Intake
    { route: '/api/intakes', methods: ['POST', 'GET'] },
    { route: '/api/intakes/:id', methods: ['GET'] },
    // Lots
    { route: '/api/lots', methods: ['GET'] },
    { route: '/api/lots/:id', methods: ['GET'] },
    { route: '/api/lots/ready-to-store', methods: ['GET'] },
    // Smart Slotting
    { route: '/api/slotting/*', methods: ['GET', 'POST'] },
    // Temperature Monitoring
    { route: '/api/temperature/*', methods: ['GET'] },
  ],

  [UserRole.QC_STAFF]: [
    // Lots (pending QC queue)
    { route: '/api/lots', methods: ['GET'] },
    { route: '/api/lots/:id', methods: ['GET'] },
    { route: '/api/lots/pending-qc', methods: ['GET'] },
    // Quality Control
    { route: '/api/qc/:lotId/result', methods: ['POST'] },
    { route: '/api/qc/:lotId/history', methods: ['GET'] },
  ],

  [UserRole.PPIC_TEAM]: [
    // Lots (view)
    { route: '/api/lots', methods: ['GET'] },
    { route: '/api/lots/:id', methods: ['GET'] },
    // PPIC Module
    { route: '/api/ppic/*', methods: ['GET', 'POST'] },
  ],

  [UserRole.FACTORY_MANAGER]: [
    // Factory Manager has access to ALL routes
    // Supplier Intake
    { route: '/api/intakes', methods: ['POST', 'GET'] },
    { route: '/api/intakes/:id', methods: ['GET'] },
    // Lots (all)
    { route: '/api/lots', methods: ['GET'] },
    { route: '/api/lots/:id', methods: ['GET'] },
    { route: '/api/lots/pending-qc', methods: ['GET'] },
    { route: '/api/lots/ready-to-store', methods: ['GET'] },
    // Quality Control
    { route: '/api/qc/:lotId/result', methods: ['POST'] },
    { route: '/api/qc/:lotId/history', methods: ['GET'] },
    // Smart Slotting
    { route: '/api/slotting/*', methods: ['GET', 'POST'] },
    // Temperature Monitoring
    { route: '/api/temperature/*', methods: ['GET'] },
    // Audit Trail
    { route: '/api/audit', methods: ['GET'] },
    // PPIC
    { route: '/api/ppic/*', methods: ['GET', 'POST'] },
    // Notifications Configuration
    { route: '/api/notifications/config', methods: ['GET', 'PUT'] },
  ],
};

/**
 * Checks whether Factory_Manager role has super admin access (all routes).
 * Factory_Manager can access everything, so permission checks can short-circuit.
 */
export function isFactoryManager(role: UserRole): boolean {
  return role === UserRole.FACTORY_MANAGER;
}

/**
 * Checks if a given role has permission to access a specific route with a specific method.
 *
 * @param role - The user's role
 * @param method - The HTTP method of the request
 * @param path - The request path (e.g., /api/intakes)
 * @returns true if the role is allowed to access the route with the given method
 */
export function hasPermission(
  role: UserRole,
  method: HttpMethod,
  path: string
): boolean {
  // Auth routes are accessible by all authenticated users
  const isAuthRoute = AUTH_ROUTES.some(
    (perm) => matchRoute(perm.route, path) && perm.methods.includes(method)
  );
  if (isAuthRoute) {
    return true;
  }

  // Factory_Manager has access to everything
  if (isFactoryManager(role)) {
    return true;
  }

  // Check role-specific permissions
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return false;
  }

  return permissions.some(
    (perm) => matchRoute(perm.route, path) && perm.methods.includes(method)
  );
}

/**
 * Returns all allowed routes for a given role.
 * Useful for client-side navigation filtering.
 */
export function getAllowedRoutes(role: UserRole): Permission[] {
  if (isFactoryManager(role)) {
    return ROLE_PERMISSIONS[UserRole.FACTORY_MANAGER];
  }
  return ROLE_PERMISSIONS[role] || [];
}
