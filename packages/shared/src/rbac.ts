import type { MembershipRole, Permission, Role } from '@assetflow/types';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  MANAGER: 'MANAGER',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  ASSET_MANAGER: 'ASSET_MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  VIEWER: 'VIEWER',
} as const satisfies Record<Role, Role>;

export const ASSIGNABLE_ROLES: readonly MembershipRole[] = [
  ROLES.ORG_ADMIN,
  ROLES.MANAGER,
  ROLES.INVENTORY_MANAGER,
  ROLES.ASSET_MANAGER,
  ROLES.EMPLOYEE,
  ROLES.VIEWER,
];

export const PERMISSIONS = {
  ASSETS_VIEW: 'assets.view',
  ASSETS_CREATE: 'assets.create',
  ASSETS_UPDATE: 'assets.update',
  ASSETS_DELETE: 'assets.delete',
  ASSETS_ASSIGN: 'assets.assign',
  ASSETS_TRANSFER: 'assets.transfer',
  ASSETS_MAINTENANCE: 'assets.maintenance',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_CREATE: 'inventory.create',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_TRANSFER: 'inventory.transfer',
  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_CREATE: 'purchases.create',
  PURCHASES_APPROVE: 'purchases.approve',
  REPORTS_VIEW: 'reports.view',
  USERS_MANAGE: 'users.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view',
} as const satisfies Record<string, Permission>;

const ASSET_PERMISSIONS = [
  PERMISSIONS.ASSETS_VIEW,
  PERMISSIONS.ASSETS_CREATE,
  PERMISSIONS.ASSETS_UPDATE,
  PERMISSIONS.ASSETS_DELETE,
  PERMISSIONS.ASSETS_ASSIGN,
  PERMISSIONS.ASSETS_TRANSFER,
  PERMISSIONS.ASSETS_MAINTENANCE,
] as const;

const INVENTORY_PERMISSIONS = [
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.INVENTORY_CREATE,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.INVENTORY_TRANSFER,
] as const;

const PURCHASE_PERMISSIONS = [
  PERMISSIONS.PURCHASES_VIEW,
  PERMISSIONS.PURCHASES_CREATE,
  PERMISSIONS.PURCHASES_APPROVE,
] as const;

const READ_ONLY_PERMISSIONS = [
  PERMISSIONS.ASSETS_VIEW,
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.PURCHASES_VIEW,
  PERMISSIONS.REPORTS_VIEW,
] as const;

export const ALL_PERMISSIONS: readonly Permission[] = [
  ...ASSET_PERMISSIONS,
  ...INVENTORY_PERMISSIONS,
  ...PURCHASE_PERMISSIONS,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.AUDIT_VIEW,
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ORG_ADMIN: ALL_PERMISSIONS,
  MANAGER: [
    ...ASSET_PERMISSIONS,
    ...INVENTORY_PERMISSIONS,
    ...PURCHASE_PERMISSIONS,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  INVENTORY_MANAGER: [
    ...INVENTORY_PERMISSIONS,
    PERMISSIONS.ASSETS_VIEW,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.REPORTS_VIEW,
  ],
  ASSET_MANAGER: [...ASSET_PERMISSIONS, PERMISSIONS.INVENTORY_VIEW, PERMISSIONS.REPORTS_VIEW],
  EMPLOYEE: [PERMISSIONS.ASSETS_VIEW],
  VIEWER: [...READ_ONLY_PERMISSIONS],
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  ORG_ADMIN: 'Organisation admin',
  MANAGER: 'Manager',
  INVENTORY_MANAGER: 'Inventory manager',
  ASSET_MANAGER: 'Asset manager',
  EMPLOYEE: 'Employee',
  VIEWER: 'Viewer',
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
