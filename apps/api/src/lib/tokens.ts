import { createHash, randomBytes } from 'node:crypto';

/** Generates a URL-safe opaque secret (256 bits of entropy). */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

/** One-way hash used to store refresh/one-time tokens at rest. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
