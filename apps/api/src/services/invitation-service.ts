import type {
  InvitationPreview,
  InvitationPublic,
  InvitationStatus,
  MembershipPublic,
  MembershipRole,
  OrganisationPublic,
} from '@assetflow/types';
import { ERROR_CODES, ROLE_LABELS } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import { generateRawToken, hashToken } from '../lib/tokens.js';
import { Invitation } from '../models/invitation.js';
import { Organisation } from '../models/organisation.js';
import { OrganisationMember } from '../models/organisation-member.js';
import { User } from '../models/user.js';
import type { AuthContext } from '../types/auth-context.js';
import type { AuditService } from './audit-service.js';
import type { EmailService } from './email/email-service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InvitationServiceDeps {
  email: EmailService;
  audit: AuditService;
}

export interface InvitationService {
  create(
    claims: AuthContext,
    input: { email: string; role: MembershipRole },
    context: { ip: string | null },
  ): Promise<InvitationPublic>;
  list(claims: AuthContext): Promise<InvitationPublic[]>;
  revoke(claims: AuthContext, invitationId: string, ip: string | null): Promise<void>;
  preview(rawToken: string): Promise<InvitationPreview>;
  accept(
    claims: AuthContext,
    rawToken: string,
    context: { ip: string | null },
  ): Promise<{ organisation: OrganisationPublic; membership: MembershipPublic }>;
}

function resolveStatus(doc: {
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date;
}): InvitationStatus {
  if (doc.status === 'pending' && doc.expiresAt.getTime() <= Date.now()) return 'expired';
  return doc.status;
}

function invalidLink(): HttpError {
  return new HttpError(
    400,
    ERROR_CODES.TOKEN_INVALID,
    'This invitation link is invalid or no longer available.',
  );
}

export function createInvitationService(deps: InvitationServiceDeps): InvitationService {
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

  async function toPublic(doc: {
    _id: unknown;
    organisationId: unknown;
    email: string;
    role: MembershipRole;
    status: 'pending' | 'accepted' | 'revoked';
    expiresAt: Date;
    createdAt: Date;
    invitedBy: unknown;
  }): Promise<InvitationPublic> {
    const inviter = await User.findById(doc.invitedBy).lean().exec();
    return {
      id: String(doc._id),
      organisationId: String(doc.organisationId),
      email: doc.email,
      role: doc.role,
      status: resolveStatus(doc),
      expiresAt: doc.expiresAt.toISOString(),
      createdAt: doc.createdAt.toISOString(),
      invitedByName: inviter?.name ?? null,
    };
  }

  return {
    async create(claims, input, context) {
      const orgId = requireOrgId(claims);
      const email = input.email.trim().toLowerCase();

      const invitedUser = await User.findOne({ email }).lean().exec();
      if (invitedUser) {
        const existingMember = await OrganisationMember.findOne({
          organisationId: orgId,
          userId: invitedUser._id,
        })
          .select('_id')
          .lean()
          .exec();
        if (existingMember) {
          throw new HttpError(
            409,
            ERROR_CODES.CONFLICT,
            'This person is already a member of the organisation.',
          );
        }
      }

      const pending = await Invitation.findOne({
        organisationId: orgId,
        email,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      })
        .select('_id')
        .lean()
        .exec();
      if (pending) {
        throw new HttpError(
          409,
          ERROR_CODES.CONFLICT,
          'An invitation for this email address is already pending.',
        );
      }

      // Replace stale invitations so at most one link per email is active.
      await Invitation.deleteMany({ organisationId: orgId, email, status: 'pending' }).exec();

      const raw = generateRawToken();
      const invitation = await Invitation.create({
        organisationId: orgId,
        email,
        role: input.role,
        tokenHash: hashToken(raw),
        invitedBy: claims.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      });

      const [org, inviter] = await Promise.all([
        Organisation.findById(orgId).lean().exec(),
        User.findById(claims.userId).lean().exec(),
      ]);

      await deps.email.sendInvitationEmail(email, {
        organisationName: org?.name ?? 'an organisation',
        inviterName: inviter?.name ?? 'A teammate',
        roleLabel: ROLE_LABELS[input.role],
        rawToken: raw,
      });

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'invitation.created',
        targetType: 'invitation',
        targetId: String(invitation._id),
        metadata: { email, role: input.role },
        ip: context.ip,
      });

      return toPublic(invitation);
    },

    async list(claims) {
      const orgId = requireOrgId(claims);
      const docs = await Invitation.find({ organisationId: orgId })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      return Promise.all(docs.map((doc) => toPublic(doc)));
    },

    async revoke(claims, invitationId, ip) {
      const orgId = requireOrgId(claims);
      const doc = await Invitation.findOne({ _id: invitationId, organisationId: orgId }).exec();
      if (!doc) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Invitation not found.');
      }
      if (doc.status !== 'pending') {
        throw new HttpError(
          409,
          ERROR_CODES.CONFLICT,
          `This invitation has already been ${doc.status}.`,
        );
      }

      doc.status = 'revoked';
      doc.revokedAt = new Date();
      await doc.save();

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'invitation.revoked',
        targetType: 'invitation',
        targetId: String(doc._id),
        metadata: { email: doc.email },
        ip,
      });
    },

    async preview(rawToken) {
      const doc = await Invitation.findOne({ tokenHash: hashToken(rawToken) })
        .lean()
        .exec();
      if (!doc) throw invalidLink();

      const org = await Organisation.findById(doc.organisationId).lean().exec();
      if (!org) throw invalidLink();

      return {
        organisationName: org.name,
        email: doc.email,
        role: doc.role,
        status: resolveStatus(doc),
        expiresAt: doc.expiresAt.toISOString(),
      };
    },

    async accept(claims, rawToken, context) {
      const doc = await Invitation.findOne({ tokenHash: hashToken(rawToken) }).exec();
      if (!doc) throw invalidLink();

      const status = resolveStatus(doc);
      if (status === 'revoked') throw invalidLink();
      if (status === 'expired') {
        throw new HttpError(409, ERROR_CODES.CONFLICT, 'This invitation has expired.');
      }

      const user = await User.findById(claims.userId).lean().exec();
      if (!user) {
        throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, 'Your account is no longer available.');
      }
      if (user.email !== doc.email) {
        throw new HttpError(
          403,
          ERROR_CODES.FORBIDDEN,
          'This invitation was sent to a different email address.',
        );
      }

      const orgId = String(doc.organisationId);
      const existing = await OrganisationMember.findOne({
        organisationId: orgId,
        userId: claims.userId,
      })
        .lean()
        .exec();
      if (!existing) {
        await OrganisationMember.create({
          organisationId: doc.organisationId,
          userId: claims.userId,
          role: doc.role,
        });
      }
      const membership = await OrganisationMember.findOne({
        organisationId: orgId,
        userId: claims.userId,
      })
        .lean()
        .exec();
      if (!membership) throw invalidLink();

      if (doc.status === 'pending') {
        doc.status = 'accepted';
        doc.acceptedAt = new Date();
        doc.set('acceptedBy', claims.userId);
        await doc.save();
      }

      const org = await Organisation.findById(orgId).lean().exec();
      if (!org) throw invalidLink();

      await deps.audit.record({
        organisationId: orgId,
        userId: claims.userId,
        action: 'invitation.accepted',
        targetType: 'invitation',
        targetId: String(doc._id),
        ip: context.ip,
      });

      return {
        organisation: {
          id: orgId,
          name: org.name,
          createdAt: org.createdAt.toISOString(),
        },
        membership: {
          organisationId: orgId,
          userId: claims.userId,
          role: membership.role,
          joinedAt: membership.createdAt.toISOString(),
        },
      };
    },
  };
}
