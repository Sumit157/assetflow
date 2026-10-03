import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  permissionsForRole,
} from './rbac.js';

describe('role permission matrix', () => {
  it('covers every role', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(Object.values(ROLES).sort());
  });

  it('only grants known permissions', () => {
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const role of Object.values(ROLES)) {
      for (const permission of permissionsForRole(role)) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it('gives admins every permission', () => {
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toEqual(ALL_PERMISSIONS);
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(ALL_PERMISSIONS);
  });

  it('keeps viewer strictly read-only', () => {
    expect(ROLE_PERMISSIONS.VIEWER).toEqual([
      PERMISSIONS.ASSETS_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.REPORTS_VIEW,
    ]);
  });

  it('restricts employees to asset visibility', () => {
    expect(ROLE_PERMISSIONS.EMPLOYEE).toEqual([PERMISSIONS.ASSETS_VIEW]);
  });

  it('does not let managers manage users or settings', () => {
    expect(hasPermission(ROLES.MANAGER, PERMISSIONS.USERS_MANAGE)).toBe(false);
    expect(hasPermission(ROLES.MANAGER, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(ROLES.MANAGER, PERMISSIONS.ASSETS_CREATE)).toBe(true);
    expect(hasPermission(ROLES.MANAGER, PERMISSIONS.PURCHASES_APPROVE)).toBe(true);
  });

  it('gives inventory managers stock and purchasing workflows', () => {
    expect(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
    expect(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.PURCHASES_CREATE)).toBe(true);
    expect(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.ASSETS_CREATE)).toBe(false);
    expect(hasPermission(ROLES.INVENTORY_MANAGER, PERMISSIONS.USERS_MANAGE)).toBe(false);
  });

  it('gives asset managers full asset lifecycle permissions', () => {
    expect(hasPermission(ROLES.ASSET_MANAGER, PERMISSIONS.ASSETS_DELETE)).toBe(true);
    expect(hasPermission(ROLES.ASSET_MANAGER, PERMISSIONS.ASSETS_ASSIGN)).toBe(true);
    expect(hasPermission(ROLES.ASSET_MANAGER, PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
    expect(hasPermission(ROLES.ASSET_MANAGER, PERMISSIONS.PURCHASES_CREATE)).toBe(false);
  });

  it('never grants permissions for unknown or missing roles', () => {
    expect(hasPermission(null, PERMISSIONS.ASSETS_VIEW)).toBe(false);
    expect(hasPermission(undefined, PERMISSIONS.ASSETS_VIEW)).toBe(false);
    expect(hasPermission('BOGUS' as never, PERMISSIONS.ASSETS_VIEW)).toBe(false);
  });

  it('never assigns the reserved super admin role to memberships', () => {
    expect(ASSIGNABLE_ROLES).not.toContain(ROLES.SUPER_ADMIN);
    expect(ASSIGNABLE_ROLES).toHaveLength(6);
  });
});
