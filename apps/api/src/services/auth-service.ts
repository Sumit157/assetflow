import type {
  AuthSessionResponse,
  MembershipRole,
  MembershipSummary,
  MeResponse,
  OrganisationPublic,
  SessionPublic,
  UserPublic,
} from '@assetflow/types';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES, ROLES } from '@assetflow/shared';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { signAccessToken, verifyAccessToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { generateRawToken, hashToken } from '../lib/tokens.js';
import type { AuditService } from './audit-service.js';
import type { EmailService } from './email/email-service.js';
import { OneTimeToken } from '../models/one-time-token.js';
import { Organisation } from '../models/organisation.js';
import { OrganisationMember } from '../models/organisation-member.js';
import { RefreshSession } from '../models/refresh-session.js';
import { User } from '../models/user.js';
import type { AuthContext } from '../types/auth-context.js';

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface SessionOutcome {
  response: AuthSessionResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface MembershipRow {
  membership: {
    organisationId: string;
    userId: string;
    role: MembershipRole;
    joinedAt: string;
  };
  organisation: OrganisationPublic | null;
  summary: MembershipSummary;
  createdAt: Date;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  organisationName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthServiceDeps {
  email: EmailService;
  audit: AuditService;
}

export interface AuthService {
  register(input: RegisterInput, context: RequestContext): Promise<SessionOutcome>;
  login(input: LoginInput, context: RequestContext): Promise<SessionOutcome>;
  refresh(rawToken: string | null, context: RequestContext): Promise<SessionOutcome>;
  logout(rawToken: string | null, context: RequestContext): Promise<void>;
  me(claims: AuthContext): Promise<MeResponse>;
  switchOrganisation(
    claims: AuthContext,
    organisationId: string,
    context: RequestContext,
  ): Promise<SessionOutcome>;
  listSessions(claims: AuthContext): Promise<SessionPublic[]>;
  revokeSession(claims: AuthContext, sessionId: string): Promise<void>;
  verifyAccessToken(token: string): AuthContext | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUserPublic(user: {
  _id: unknown;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
}): UserPublic {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

function refreshTtlMs(): number {
  return env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  async function loadMemberships(userId: string): Promise<MembershipRow[]> {
    const memberDocs = await OrganisationMember.find({ userId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    if (memberDocs.length === 0) return [];

    const orgs = await Organisation.find({ _id: { $in: memberDocs.map((m) => m.organisationId) } })
      .lean()
      .exec();
    const orgById = new Map(orgs.map((org) => [String(org._id), org]));

    return memberDocs.map((member) => {
      const organisationId = String(member.organisationId);
      const org = orgById.get(organisationId) ?? null;
      return {
        membership: {
          organisationId,
          userId: String(member.userId),
          role: member.role,
          joinedAt: member.createdAt.toISOString(),
        },
        organisation: org
          ? { id: organisationId, name: org.name, createdAt: org.createdAt.toISOString() }
          : null,
        summary: {
          organisationId,
          organisationName: org?.name ?? 'Unknown organisation',
          role: member.role,
        },
        createdAt: member.createdAt,
      };
    });
  }

  async function buildSessionResponse(
    userId: string,
    family: string,
    preferredOrgId: string | null | undefined,
  ): Promise<AuthSessionResponse> {
    const user = await User.findById(userId).lean().exec();
    if (!user) {
      throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, 'Your account is no longer available.');
    }

    const memberships = await loadMemberships(userId);
    const active =
      (preferredOrgId
        ? memberships.find((row) => row.membership.organisationId === preferredOrgId)
        : undefined) ??
      memberships[0] ??
      null;

    const accessToken = signAccessToken({
      userId: String(user._id),
      sessionId: family,
      ...(active ? { orgId: active.membership.organisationId, role: active.membership.role } : {}),
    });

    return {
      user: toUserPublic(user),
      organisation: active?.organisation ?? null,
      membership: active?.membership ?? null,
      memberships: memberships.map((row) => row.summary),
      accessToken,
    };
  }

  async function createSession(
    userId: string,
    activeOrganisationId: string | null,
    context: RequestContext,
  ): Promise<{ raw: string; expiresAt: Date; family: string }> {
    const raw = generateRawToken();
    const family = randomUUID();
    const expiresAt = new Date(Date.now() + refreshTtlMs());
    await RefreshSession.create({
      userId,
      family,
      sessionStartedAt: new Date(),
      tokenHash: hashToken(raw),
      activeOrganisationId,
      userAgent: context.userAgent,
      ip: context.ip,
      expiresAt,
    });
    return { raw, expiresAt, family };
  }

  async function revokeFamily(family: string): Promise<void> {
    await RefreshSession.updateMany(
      { family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ).exec();
  }

  const service: AuthService = {
    verifyAccessToken(token) {
      return verifyAccessToken(token);
    },

    async register(input, context) {
      const email = normalizeEmail(input.email);
      const existing = await User.findOne({ email }).select('_id').lean().exec();
      if (existing) {
        throw new HttpError(
          409,
          ERROR_CODES.EMAIL_TAKEN,
          'An account with this email address already exists.',
        );
      }

      const passwordHash = await hashPassword(input.password);
      const organisationName = input.organisationName.trim();

      const user = await User.create({
        name: input.name.trim(),
        email,
        passwordHash,
      }).catch((error: unknown) => {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: number }).code === 11000
        ) {
          throw new HttpError(
            409,
            ERROR_CODES.EMAIL_TAKEN,
            'An account with this email address already exists.',
          );
        }
        throw error;
      });

      const organisation = await Organisation.create({ name: organisationName });
      await OrganisationMember.create({
        organisationId: organisation._id,
        userId: user._id,
        role: ROLES.ORG_ADMIN,
      });

      const session = await createSession(String(user._id), String(organisation._id), context);
      const response = await buildSessionResponse(
        String(user._id),
        session.family,
        String(organisation._id),
      );

      const verifyRaw = generateRawToken();
      await OneTimeToken.create({
        userId: user._id,
        purpose: 'email_verify',
        tokenHash: hashToken(verifyRaw),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await deps.email.sendVerificationEmail(email, verifyRaw);

      await deps.audit.record({
        organisationId: String(organisation._id),
        userId: String(user._id),
        action: 'auth.register',
        targetType: 'organisation',
        targetId: String(organisation._id),
        ip: context.ip,
      });

      return { response, refreshToken: session.raw, refreshExpiresAt: session.expiresAt };
    },

    async login(input, context) {
      const email = normalizeEmail(input.email);
      const user = await User.findOne({ email }).select('+passwordHash').lean().exec();

      if (!user) {
        await deps.audit.record({
          action: 'auth.login_failed',
          metadata: { email },
          ip: context.ip,
        });
        throw new HttpError(
          401,
          ERROR_CODES.INVALID_CREDENTIALS,
          'Email or password is incorrect.',
        );
      }

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        await deps.audit.record({
          userId: String(user._id),
          action: 'auth.login_failed',
          metadata: { email },
          ip: context.ip,
        });
        throw new HttpError(
          401,
          ERROR_CODES.INVALID_CREDENTIALS,
          'Email or password is incorrect.',
        );
      }

      const firstMembership = await OrganisationMember.findOne({ userId: user._id })
        .sort({ createdAt: 1 })
        .lean()
        .exec();
      const activeOrgId = firstMembership ? String(firstMembership.organisationId) : null;

      const session = await createSession(String(user._id), activeOrgId, context);
      const response = await buildSessionResponse(String(user._id), session.family, activeOrgId);

      await deps.audit.record({
        organisationId: response.membership?.organisationId ?? null,
        userId: String(user._id),
        action: 'auth.login',
        ip: context.ip,
      });

      return { response, refreshToken: session.raw, refreshExpiresAt: session.expiresAt };
    },

    async refresh(rawToken, context) {
      const expiredError = new HttpError(
        401,
        ERROR_CODES.SESSION_EXPIRED,
        'Your session has expired. Please sign in again.',
      );
      if (!rawToken) throw expiredError;

      const doc = await RefreshSession.findOne({ tokenHash: hashToken(rawToken) }).exec();
      if (!doc) throw expiredError;

      if (doc.revokedAt || doc.rotatedAt) {
        // A rotated or revoked token was replayed: assume theft and kill the family.
        await revokeFamily(doc.family);
        await deps.audit.record({
          userId: String(doc.userId),
          action: 'auth.session_revoked',
          metadata: { reason: 'token_reuse' },
          ip: context.ip,
        });
        throw expiredError;
      }
      if (doc.expiresAt.getTime() <= Date.now()) throw expiredError;

      const now = new Date();
      const rotation = await RefreshSession.updateOne(
        { _id: doc._id, rotatedAt: null, revokedAt: null },
        { $set: { rotatedAt: now } },
      ).exec();
      if (rotation.modifiedCount === 0) {
        await revokeFamily(doc.family);
        throw expiredError;
      }

      const rawNext = generateRawToken();
      const expiresAt = new Date(now.getTime() + refreshTtlMs());
      await RefreshSession.create({
        userId: doc.userId,
        family: doc.family,
        sessionStartedAt: doc.sessionStartedAt,
        tokenHash: hashToken(rawNext),
        activeOrganisationId: doc.activeOrganisationId,
        userAgent: context.userAgent ?? doc.userAgent,
        ip: context.ip,
        expiresAt,
      });

      const preferred = doc.activeOrganisationId ? String(doc.activeOrganisationId) : null;
      const response = await buildSessionResponse(String(doc.userId), doc.family, preferred);

      const resolvedOrgId = response.membership?.organisationId ?? null;
      if (resolvedOrgId !== preferred) {
        await RefreshSession.updateOne(
          { family: doc.family, rotatedAt: null, revokedAt: null },
          { $set: { activeOrganisationId: resolvedOrgId } },
        ).exec();
      }

      return { response, refreshToken: rawNext, refreshExpiresAt: expiresAt };
    },

    async logout(rawToken, context) {
      if (!rawToken) return;
      const doc = await RefreshSession.findOne({ tokenHash: hashToken(rawToken) }).exec();
      if (!doc || doc.revokedAt) return;

      await revokeFamily(doc.family);
      await deps.audit.record({
        organisationId: doc.activeOrganisationId ? String(doc.activeOrganisationId) : null,
        userId: String(doc.userId),
        action: 'auth.logout',
        ip: context.ip,
      });
    },

    async me(claims) {
      const user = await User.findById(claims.userId).lean().exec();
      if (!user) {
        throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, 'Your account is no longer available.');
      }

      const memberships = await loadMemberships(claims.userId);

      if (claims.orgId) {
        const active = memberships.find((row) => row.membership.organisationId === claims.orgId);
        if (!active) {
          throw new HttpError(
            403,
            ERROR_CODES.FORBIDDEN,
            'Your membership in this organisation has been revoked.',
          );
        }
        return {
          user: toUserPublic(user),
          organisation: active.organisation,
          membership: active.membership,
          memberships: memberships.map((row) => row.summary),
        };
      }

      return {
        user: toUserPublic(user),
        organisation: null,
        membership: null,
        memberships: memberships.map((row) => row.summary),
      } satisfies MeResponse;
    },

    async switchOrganisation(claims, organisationId, context) {
      const membership = await OrganisationMember.findOne({
        userId: claims.userId,
        organisationId,
      })
        .lean()
        .exec();
      if (!membership) {
        throw new HttpError(
          403,
          ERROR_CODES.FORBIDDEN,
          'You are not a member of this organisation.',
        );
      }

      const session = await RefreshSession.findOne({
        family: claims.sessionId,
        userId: claims.userId,
        rotatedAt: null,
        revokedAt: null,
      }).exec();
      if (!session || session.expiresAt.getTime() <= Date.now()) {
        throw new HttpError(
          401,
          ERROR_CODES.SESSION_EXPIRED,
          'Your session has expired. Please sign in again.',
        );
      }

      session.set('activeOrganisationId', organisationId);
      await session.save();

      const response = await buildSessionResponse(claims.userId, claims.sessionId, organisationId);

      await deps.audit.record({
        organisationId,
        userId: claims.userId,
        action: 'auth.switch_org',
        ip: context.ip,
      });

      return { response, refreshToken: '', refreshExpiresAt: session.expiresAt };
    },

    async listSessions(claims) {
      const docs = await RefreshSession.find({
        userId: claims.userId,
        rotatedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
        .sort({ sessionStartedAt: -1 })
        .lean()
        .exec();

      return docs.map((doc) => ({
        id: String(doc._id),
        userAgent: doc.userAgent ?? null,
        ip: doc.ip ?? null,
        createdAt: doc.sessionStartedAt.toISOString(),
        current: doc.family === claims.sessionId,
      }));
    },

    async revokeSession(claims, sessionId) {
      const doc = await RefreshSession.findOne({ _id: sessionId, userId: claims.userId })
        .lean()
        .exec();
      if (!doc) {
        throw new HttpError(404, ERROR_CODES.NOT_FOUND, 'Session not found.');
      }

      await revokeFamily(doc.family);
      await deps.audit.record({
        userId: claims.userId,
        action: 'auth.session_revoked',
        targetType: 'session',
        targetId: String(doc._id),
        ip: null,
      });
    },
  };

  return service;
}
