# Security Requirements

Security is a product requirement, not a later task.

## Authentication

- Hash passwords with a modern password hashing algorithm.
- Use secure refresh-token handling.
- Prefer HTTP-only secure cookies for browser authentication where appropriate.
- Rotate/revoke sessions.
- Rate-limit authentication endpoints.

Implemented in Phase 1:

- Passwords hashed with `node:crypto` **scrypt** (N=32768, r=8, p=1, 64-byte key,
  16-byte random salt, `timingSafeEqual` comparison), minimum 10 characters.
- Access tokens are HS256 JWTs (`JWT_SECRET`, min 32 chars, required in production),
  15-minute lifetime, held **in memory only** (never `localStorage`), sent as
  `Authorization: Bearer`.
- Refresh tokens are opaque 256-bit random secrets, stored **hashed** (SHA-256) in the
  `RefreshSession` collection and delivered in an HTTP-only, `SameSite=Lax`
  cookie (`Secure` in production) scoped to `path=/api/v1/auth`.
- Refresh **rotates** the token on every use; a replayed (already-rotated) token
  revokes the entire session family and writes an `auth.session_revoked`
  (`token_reuse`) audit entry.
- Password reset and email verification use single-use hashed one-time tokens with
  short TTLs (1 hour / 24 hours). A successful reset revokes all of the user's
  sessions.
- Authentication endpoints run behind a stricter rate limit
  (`AUTH_RATE_LIMIT_MAX` per `AUTH_RATE_LIMIT_WINDOW_MS`); all API requests share the
  global budget.
- Failed logins return an identical `401 INVALID_CREDENTIALS` for unknown emails and
  wrong passwords; `forgot-password` always answers `200`.

## Authorisation

Check permissions server-side.

Frontend permission checks are for UX only and are never security boundaries.

`hasPermission(role, permission)` lives in `packages/shared` (`ROLE_PERMISSIONS`) and
is enforced by the `requirePermission` middleware. `SUPER_ADMIN` is reserved and can
never be assigned through the API.

| Role                | Permissions                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `ORG_ADMIN`         | all permissions (assets, inventory, purchases, reports, users.manage, settings.manage, audit.view) |
| `MANAGER`           | assets.* (7), inventory.* (4), purchases.* (3), reports.view, audit.view                           |
| `INVENTORY_MANAGER` | inventory.* (4), assets.view, purchases.view, purchases.create, reports.view                       |
| `ASSET_MANAGER`     | assets.* (7), inventory.view, reports.view                                                         |
| `EMPLOYEE`          | assets.view                                                                                        |
| `VIEWER`            | assets.view, inventory.view, purchases.view, reports.view                                          |
| `SUPER_ADMIN`       | reserved — not assignable, not issued                                                              |

Additional invariants (service level):

- A user cannot change their own role or remove themselves (`403`).
- An organisation must keep at least one `ORG_ADMIN` (`409 CONFLICT`).
- The role in a JWT can be stale for at most one access-token lifetime (15 minutes);
  `switch-org`/`refresh` re-resolve role and organisation from the database.

## Tenant isolation

Every tenant-owned request must be scoped to the authenticated organisation.

Implemented via `requireActiveOrganisation`: the `:id` of org-scoped routes must equal
the `orgId` claim of the presented access token, otherwise `403 FORBIDDEN`. Removing a
member revokes their refresh sessions whose active organisation is that organisation.

Test attempts to access another organisation's:

- assets
- products
- employees
- suppliers
- purchase orders
- reports
- audit logs

## Input security

- Zod/server validation
- Mongo query sanitisation
- output encoding where needed
- upload MIME/type validation
- upload size limits
- safe file names

## HTTP security

Use:

- Helmet
- restrictive CORS
- rate limiting
- secure headers
- request IDs
- safe error responses

## Secrets

Never commit:

- passwords
- JWT secrets
- API keys
- cloud credentials
- database credentials

Provide `.env.example`.

## Audit

Security-sensitive actions should be auditable:

- login
- logout
- permission changes
- user changes
- asset changes
- inventory adjustments
- purchase approvals
- settings changes

Phase 1 writes `AuditLog` entries (append-only) for: register, login, failed login,
logout, refresh, session revocation (incl. token reuse), password reset request and
reset, email verification and resend, organisation create/update, organisation switch,
member role change, member removal, invitation create/accept/revoke.

## Known tradeoffs

- **Best-effort logout**: `POST /auth/logout` failures (network) still sign the user
  out locally; the server session then lives until expiry or until it is revoked from
  the Active sessions list on the Account page.
- **Member removal** revokes only sessions whose _active_ organisation is the one they
  left; sessions actively using another organisation keep running until they switch
  back (they can no longer switch in) or expire.
- **Removed members** can still read cached data in an open tab for up to one access
  token (15 minutes); the next refresh fails because their session was revoked.
