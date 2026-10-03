import type { MembershipRole } from '@assetflow/types';

export interface AuthContext {
  /** Authenticated user id. */
  userId: string;
  /** Refresh-session family id (stable across rotations). */
  sessionId: string;
  /** Active organisation id for this session, when the user belongs to one. */
  orgId?: string;
  /** Role in the active organisation, resolved when the token was issued. */
  role?: MembershipRole;
}
