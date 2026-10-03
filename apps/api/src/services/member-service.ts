import type { MemberPublic, MembershipRole } from '@assetflow/types';
import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import { OrganisationMember } from '../models/organisation-member.js';
import { RefreshSession } from '../models/refresh-session.js';
import { User } from '../models/user.js';
import type { AuthContext } from '../types/auth-context.js';
import type { AuditService } from './audit-service.js';

export interface MemberServiceDeps {
  audit: AuditService;
}

export interface MemberService {
  list(claims: AuthContext): Promise<MemberPublic[]>;
  updateRole(
    claims: AuthContext,
    targetUserId: string,
    role: MembershipRole,
    ip: string | null,
  ): Promise<void>;
  remove(claims: AuthContext, targetUserId: string, ip: string | null): Promise<void>;
}

export function createMemberService(deps: MemberServiceDeps): MemberService {
  function requireOrgId(claims: AuthContext): string {
    if (!claims.orgId) {
      throw new HttpError(
        403,
        ERROR_CODES.ORGANISATION_REQUIRED,
        'You do not have an active organisation.',
      );
    }
    return claims.orgId;
  }

  async function findTargetMembership(orgId: string, targetUserId: string) {
    const membership = await OrganisationMember.findOne({
      organisationId: orgId,
      userId: targetUserId,
    })
      .lean()
      .exec();
    if (!membership) {
      throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Member not found.');
    }
    return membership;
  }

  async function assertNotLastAdmin(orgId: string) {
    const admins = await OrganisationMember.countDocuments({
      organisationId: orgId,
      role: 'ORG_ADMIN',
    }).exec();
    if (admins <= 1) {
      throw new HttpError(
        409,
        ERROR_CODES.CONFLICT,
        'An organisation must keep at least one administrator.',
      );
    }
  }

  return {
    async list(claims) {
      const orgId = requireOrgId(claims);
      const memberships = await OrganisationMember.find({ organisationId: orgId })
        .sort({ createdAt: 1 })
        .lean()
        .exec();
      if (memberships.length === 0) return [];

      const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
        .lean()
        .exec();
      const userById = new Map(users.map((user) => [String(user._id), user]));

      return memberships.flatMap((membership) => {
        const user = userById.get(String(membership.userId));
        if (!user) return [];
        return [
          {
            userId: String(membership.userId),
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            role: membership.role,
            joinedAt: membership.createdAt.toISOString(),
          },
        ];
      });
    },

    async updateRole(claims, targetUserId, role, ip) {
      const orgId = requireOrgId(claims);
      if (targetUserId === claims.userId) {
        throw new HttpError(
          403,
          ERROR_CODES.FORBIDDEN,
          'You cannot change your own role. Ask another administrator.',
        );
      }

      const membership = await findTargetMembership(orgId, targetUserId);
      if (membership.role === role) return;

      if (membership.role === 'ORG_ADMIN') {
        await assertNotLastAdmin(orgId);
      }

      await OrganisationMember.updateOne({ _id: membership._id }, { $set: { role } }).exec();

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'member.role_changed',
        targetType: 'user',
        targetId: targetUserId,
        metadata: { from: membership.role, to: role },
        ip,
      });
    },

    async remove(claims, targetUserId, ip) {
      const orgId = requireOrgId(claims);
      if (targetUserId === claims.userId) {
        throw new HttpError(
          403,
          ERROR_CODES.FORBIDDEN,
          'You cannot remove yourself from the organisation.',
        );
      }

      const membership = await findTargetMembership(orgId, targetUserId);
      if (membership.role === 'ORG_ADMIN') {
        await assertNotLastAdmin(orgId);
      }

      await OrganisationMember.deleteOne({ _id: membership._id }).exec();
      // Kill refresh sessions whose active context is this organisation.
      await RefreshSession.updateMany(
        { userId: targetUserId, activeOrganisationId: orgId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      ).exec();

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'member.removed',
        targetType: 'user',
        targetId: targetUserId,
        metadata: { role: membership.role },
        ip,
      });
    },
  };
}
