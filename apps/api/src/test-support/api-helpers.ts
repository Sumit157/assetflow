import request from 'supertest';
import type { Application } from 'express';
import type { MailMessage } from '../services/email/transport.js';

export interface TestPrincipal {
  email: string;
  userId: string;
  orgId: string;
  accessToken: string;
  refreshCookie: string;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}@example.test`;
}

export function refreshCookieFrom(res: request.Response): string {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const cookie = cookies.find((value) => value.startsWith('af_refresh='));
  if (!cookie) throw new Error('expected a refresh cookie on the response');
  return cookie.split(';')[0] ?? '';
}

/** Extracts the token from an emailed link (reset/verify/invite). */
export function tokenFromMailbox(mailbox: MailMessage[], linkPattern: RegExp): string {
  for (const message of mailbox) {
    const match = message.text.match(linkPattern);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  throw new Error(`no email containing ${linkPattern} found in mailbox`);
}

export const VERIFY_LINK = /verify-email\?token=([A-Za-z0-9_-]+)/;
export const RESET_LINK = /reset-password\?token=([A-Za-z0-9_-]+)/;
export const INVITE_LINK = /invitations\/([A-Za-z0-9_-]+)/;

export interface RegisterOptions {
  name?: string;
  organisationName?: string;
  password?: string;
}

export async function registerPrincipal(
  app: Application,
  options: RegisterOptions & { email?: string } = {},
): Promise<TestPrincipal> {
  const email = options.email ?? uniqueEmail();
  const password = options.password ?? 'correct horse battery';

  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({
      name: options.name ?? 'Test User',
      email,
      password,
      organisationName: options.organisationName ?? 'Test Organisation',
    })
    .expect(201);

  return {
    email,
    userId: response.body.data.user.id,
    orgId: response.body.data.organisation.id,
    accessToken: response.body.data.accessToken as string,
    refreshCookie: refreshCookieFrom(response),
  };
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
