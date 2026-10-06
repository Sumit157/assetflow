export type Role =
  | 'SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'MANAGER'
  | 'INVENTORY_MANAGER'
  | 'ASSET_MANAGER'
  | 'EMPLOYEE'
  | 'VIEWER';

export type MembershipRole = Exclude<Role, 'SUPER_ADMIN'>;

export type Permission =
  | 'assets.view'
  | 'assets.create'
  | 'assets.update'
  | 'assets.delete'
  | 'assets.assign'
  | 'assets.transfer'
  | 'assets.maintenance'
  | 'inventory.view'
  | 'inventory.create'
  | 'inventory.adjust'
  | 'inventory.transfer'
  | 'purchases.view'
  | 'purchases.create'
  | 'purchases.approve'
  | 'reports.view'
  | 'users.manage'
  | 'settings.manage'
  | 'audit.view';

export interface UserPublic {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface OrganisationPublic {
  id: string;
  name: string;
  createdAt: string;
}

export interface MembershipPublic {
  organisationId: string;
  userId: string;
  role: MembershipRole;
  joinedAt: string;
}

export interface MembershipSummary {
  organisationId: string;
  organisationName: string;
  role: MembershipRole;
}

export interface MemberPublic {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: MembershipRole;
  joinedAt: string;
}

export interface AuthSessionResponse {
  user: UserPublic;
  organisation: OrganisationPublic | null;
  membership: MembershipPublic | null;
  memberships: MembershipSummary[];
  accessToken: string;
}

export interface MeResponse {
  user: UserPublic;
  organisation: OrganisationPublic | null;
  membership: MembershipPublic | null;
  memberships: MembershipSummary[];
}

export interface SessionPublic {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  current: boolean;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface InvitationPublic {
  id: string;
  organisationId: string;
  email: string;
  role: MembershipRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedByName: string | null;
}

export interface InvitationPreview {
  organisationName: string;
  email: string;
  role: MembershipRole;
  status: InvitationStatus;
  expiresAt: string;
}

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.refresh'
  | 'auth.session_revoked'
  | 'auth.password_reset_requested'
  | 'auth.password_reset'
  | 'auth.email_verification_resent'
  | 'auth.email_verified'
  | 'auth.switch_org'
  | 'organisation.created'
  | 'organisation.updated'
  | 'member.role_changed'
  | 'member.removed'
  | 'invitation.created'
  | 'invitation.accepted'
  | 'invitation.revoked'
  | 'asset_category.created'
  | 'asset_category.updated'
  | 'asset_category.deleted'
  | 'location.created'
  | 'location.updated'
  | 'location.deleted'
  | 'asset.created'
  | 'asset.updated'
  | 'asset.deleted'
  | 'asset.assigned'
  | 'asset.returned'
  | 'asset.transferred'
  | 'asset.retired';
