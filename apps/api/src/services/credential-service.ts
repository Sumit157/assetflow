import { ERROR_CODES } from '@assetflow/shared';
import { HttpError } from '../lib/http-error.js';
import { hashPassword } from '../lib/password.js';
import { generateRawToken, hashToken } from '../lib/tokens.js';
import { OneTimeToken } from '../models/one-time-token.js';
import { RefreshSession } from '../models/refresh-session.js';
import { User } from '../models/user.js';
import type { AuthContext } from '../types/auth-context.js';
import type { AuditService } from './audit-service.js';
import type { EmailService } from './email/email-service.js';
import type { RequestContext } from './auth-service.js';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export interface CredentialServiceDeps {
  email: EmailService;
  audit: AuditService;
}

export interface CredentialService {
  forgotPassword(email: string, context: RequestContext): Promise<void>;
  resetPassword(input: { token: string; password: string }, context: RequestContext): Promise<void>;
  verifyEmail(token: string, context: RequestContext): Promise<void>;
  resendVerification(claims: AuthContext, context: RequestContext): Promise<void>;
}

export function createCredentialService(deps: CredentialServiceDeps): CredentialService {
  const invalidToken = () =>
    new HttpError(
      400,
      ERROR_CODES.TOKEN_INVALID,
      'This link is invalid or has expired. Request a new one and try again.',
    );

  return {
    async forgotPassword(email, context) {
      const normalized = email.trim().toLowerCase();
      const user = await User.findOne({ email: normalized }).lean().exec();
      if (!user) return;

      await OneTimeToken.deleteMany({ userId: user._id, purpose: 'password_reset' }).exec();
      const raw = generateRawToken();
      await OneTimeToken.create({
        userId: user._id,
        purpose: 'password_reset',
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      });
      await deps.email.sendPasswordResetEmail(user.email, raw);

      await deps.audit.record({
        userId: String(user._id),
        action: 'auth.password_reset_requested',
        ip: context.ip,
      });
    },

    async resetPassword(input, context) {
      const tokenDoc = await OneTimeToken.findOne({
        tokenHash: hashToken(input.token),
        purpose: 'password_reset',
      }).exec();
      if (!tokenDoc || tokenDoc.expiresAt.getTime() <= Date.now()) {
        if (tokenDoc) await OneTimeToken.deleteOne({ _id: tokenDoc._id }).exec();
        throw invalidToken();
      }

      const passwordHash = await hashPassword(input.password);
      const user = await User.findById(tokenDoc.userId).exec();
      if (!user) throw invalidToken();

      user.passwordHash = passwordHash;
      await user.save();

      await OneTimeToken.deleteMany({ userId: user._id, purpose: 'password_reset' }).exec();
      // A password change invalidates every existing session for safety.
      await RefreshSession.updateMany(
        { userId: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      ).exec();

      await deps.audit.record({
        userId: String(user._id),
        action: 'auth.password_reset',
        ip: context.ip,
      });
    },

    async verifyEmail(token, context) {
      const tokenDoc = await OneTimeToken.findOne({
        tokenHash: hashToken(token),
        purpose: 'email_verify',
      }).exec();
      if (!tokenDoc || tokenDoc.expiresAt.getTime() <= Date.now()) {
        if (tokenDoc) await OneTimeToken.deleteOne({ _id: tokenDoc._id }).exec();
        throw invalidToken();
      }

      await User.updateOne({ _id: tokenDoc.userId }, { $set: { emailVerified: true } }).exec();
      await OneTimeToken.deleteOne({ _id: tokenDoc._id }).exec();

      await deps.audit.record({
        userId: String(tokenDoc.userId),
        action: 'auth.email_verified',
        ip: context.ip,
      });
    },

    async resendVerification(claims, context) {
      const user = await User.findById(claims.userId).exec();
      if (!user) {
        throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, 'Your account is no longer available.');
      }
      if (user.emailVerified) {
        throw new HttpError(409, ERROR_CODES.CONFLICT, 'Your email address is already verified.');
      }

      await OneTimeToken.deleteMany({ userId: user._id, purpose: 'email_verify' }).exec();
      const raw = generateRawToken();
      await OneTimeToken.create({
        userId: user._id,
        purpose: 'email_verify',
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      });
      await deps.email.sendVerificationEmail(user.email, raw);

      await deps.audit.record({
        userId: String(user._id),
        action: 'auth.email_verification_resent',
        ip: context.ip,
      });
    },
  };
}
