import jwt from 'jsonwebtoken';
import type { MembershipRole } from '@assetflow/types';
import { ASSIGNABLE_ROLES } from '@assetflow/shared';
import { env } from '../config/env.js';
import type { AuthContext } from '../types/auth-context.js';

interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  sid: string;
  orgId?: string;
  role?: string;
}

export function signAccessToken(context: AuthContext): string {
  return jwt.sign(
    {
      sid: context.sessionId,
      ...(context.orgId ? { orgId: context.orgId } : {}),
      ...(context.role ? { role: context.role } : {}),
    },
    env.JWT_SECRET,
    {
      subject: context.userId,
      algorithm: 'HS256',
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    },
  );
}

export function verifyAccessToken(token: string): AuthContext | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub || typeof decoded.sid !== 'string') {
      return null;
    }
    const payload = decoded as AccessTokenPayload;
    const context: AuthContext = {
      userId: payload.sub,
      sessionId: payload.sid,
    };
    if (payload.orgId) context.orgId = payload.orgId;
    if (payload.role && (ASSIGNABLE_ROLES as readonly string[]).includes(payload.role)) {
      context.role = payload.role as MembershipRole;
    }
    return context;
  } catch {
    return null;
  }
}
