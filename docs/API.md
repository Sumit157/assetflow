# API Specification

Base path:

`/api/v1`

## Response format

Successful responses wrap the payload:

```json
{ "data": {} }
```

Errors use a stable envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "0f8c1e8e-...",
    "details": {}
  }
}
```

- `code` is a machine-readable constant from `packages/shared` (`ERROR_CODES`).
- `requestId` matches the `x-request-id` header and the API access logs.
- `details` is only present for validation errors (field-level messages).

## Health

- GET `/health/live` — liveness probe; always `200` when the process runs:
  `{"data":{"status":"ok","timestamp":"...","uptimeSeconds":123}}`
- GET `/health/ready` — readiness probe; `200` when MongoDB and Redis are reachable,
  `503` otherwise: `{"data":{"status":"ready","dependencies":{"mongo":"up","redis":"up"}}}`

Both endpoints are unauthenticated and excluded from rate limiting.

## Authentication

Auth is stateless on the server:

- **Access token** — short-lived JWT (15 minutes, `ACCESS_TOKEN_TTL_SECONDS`) sent as
  `Authorization: Bearer <token>`. Claims: `sub` (user), `sid` (refresh-session family),
  `orgId`, `role`.
- **Refresh token** — opaque secret in the `af_refresh` HTTP-only cookie, scoped to
  `path=/api/v1/auth`. Rotated on every refresh; replay of a rotated token revokes the
  whole session family. The cookie slides (30 days, `REFRESH_TOKEN_TTL_DAYS`).

Every response below that issues a token also refreshes the cookie. The
`AuthSessionResponse` payload is:

```json
{
  "data": {
    "user": {
      "id": "...",
      "name": "...",
      "email": "...",
      "emailVerified": true,
      "createdAt": "..."
    },
    "organisation": { "id": "...", "name": "...", "createdAt": "..." },
    "membership": {
      "organisationId": "...",
      "userId": "...",
      "role": "ORG_ADMIN",
      "joinedAt": "..."
    },
    "memberships": [{ "organisationId": "...", "organisationName": "...", "role": "ORG_ADMIN" }],
    "accessToken": "..."
  }
}
```

`organisation` and `membership` are `null` when the user has no active organisation.

- POST `/auth/register` — creates a user, an organisation and an `ORG_ADMIN` membership in
  one transaction, then opens a session.
  Body: `{ "name", "email", "password", "organisationName" }` (password ≥ 10 chars).
  `201` AuthSessionResponse · `400 VALIDATION_ERROR` · `409 EMAIL_TAKEN` ·
  `429 RATE_LIMITED`
- POST `/auth/login` — Body: `{ "email", "password" }`.
  `200` AuthSessionResponse · `401 INVALID_CREDENTIALS` (identical for unknown email and
  wrong password) · `429 RATE_LIMITED`
- POST `/auth/refresh` — rotates the cookie and returns a fresh access token from the
  session in the cookie. `200` AuthSessionResponse · `401 SESSION_EXPIRED`
- POST `/auth/logout` — revokes the session behind the cookie and clears it.
  Always `200 { "data": null }`.
- POST `/auth/forgot-password` — Body: `{ "email" }`. Always `200 { "data": null }`
  (no account enumeration); the reset email (1-hour link) is sent only when the account
  exists.
- POST `/auth/reset-password` — Body: `{ "token", "password" }`. Consumes the token and
  revokes every refresh session of the user. `200` · `400 TOKEN_INVALID` ·
  `400 VALIDATION_ERROR`
- POST `/auth/verify-email` — Body: `{ "token" }` (24-hour link, single use).
  `200` · `400 TOKEN_INVALID`
- POST `/auth/resend-verification` — authenticated; re-issues the link for unverified
  accounts. `200` · `401 UNAUTHORIZED` · `409 CONFLICT` (already verified)
- GET `/auth/me` — current user, active organisation, membership and all memberships.
  `200` MeResponse · `401 UNAUTHORIZED`
- POST `/auth/switch-org` — Body: `{ "organisationId" }`. Requires membership; updates
  the session's active organisation and returns a new access token with the new
  `orgId`/`role`. `200` AuthSessionResponse · `403 FORBIDDEN` (not a member) ·
  `401 SESSION_EXPIRED`
- GET `/auth/sessions` — active (unrotated, unrevoked) sessions for the current user:
  `{ "id", "userAgent", "ip", "createdAt", "current" }[]`
- DELETE `/auth/sessions/:id` — revokes one of the caller's sessions.
  `200` · `404 NOT_FOUND` (also when the session belongs to another user)

All `/auth/*` mutation endpoints except `refresh`/`logout` are rate limited by the
stricter auth budget (`AUTH_RATE_LIMIT_MAX` per `AUTH_RATE_LIMIT_WINDOW_MS`).

## Organisations

List endpoints are caller-scoped; `:id` routes accept **only** the organisation id in the
caller's active session (`403 FORBIDDEN` otherwise — clients can never address another
tenant).

- GET `/organisations` — every organisation the caller belongs to:
  `{ "id", "name", "createdAt" }[]`
- POST `/organisations` — Body: `{ "name" }`. Creates an organisation and makes the
  caller its `ORG_ADMIN` (session stays on the current organisation).
  `201` OrganisationPublic
- GET `/organisations/:id` — `200` OrganisationPublic
- PATCH `/organisations/:id` — permission `settings.manage`. Body: `{ "name" }`.
  `200` OrganisationPublic · `403 FORBIDDEN`
- GET `/organisations/:id/members` — `{ "userId", "name", "email", "emailVerified",
"role", "joinedAt" }[]` (any member can read)
- PATCH `/organisations/:id/members/:userId` — permission `users.manage`. Body:
  `{ "role" }` (`MembershipRole`, never `SUPER_ADMIN`).
  `200` · `403 FORBIDDEN` (self-edit or missing permission) · `409 CONFLICT` (would
  remove the last administrator) · `404 NOT_FOUND`
- DELETE `/organisations/:id/members/:userId` — permission `users.manage`. Removes the
  member and revokes their sessions whose active organisation is this one.
  `200` · `403` · `409 CONFLICT` (last administrator) · `404`
- GET `/organisations/:id/invitations` — permission `users.manage`. All invitations of
  the organisation: `InvitationPublic[]` (`status`: `pending|accepted|revoked|expired`)
- POST `/organisations/:id/invitations` — permission `users.manage`. Body:
  `{ "email", "role" }`. Emails a 7-day link. `201` InvitationPublic ·
  `409 CONFLICT` (already a member / pending invitation exists)
- DELETE `/organisations/:id/invitations/:invitationId` — permission `users.manage`.
  `200` · `404` · `409 CONFLICT` (not pending)

## Invitations

- GET `/invitations/:token` — public link preview (the token is the secret):
  `{ "organisationName", "email", "role", "status", "expiresAt" }`.
  `400 TOKEN_INVALID` for unknown tokens
- POST `/invitations/accept` — Body: `{ "token" }`. Requires authentication; the
  account email must match the invited address. Idempotent for already-accepted links.
  `200 { "organisation": OrganisationPublic, "membership": MembershipPublic }` ·
  `400 TOKEN_INVALID` (unknown/revoked) · `403 FORBIDDEN` (email mismatch) ·
  `409 CONFLICT` (expired)

## Assets

Asset, category and location endpoints are tenant-scoped by the `orgId` claim in the
access token — there is no organisation id in the path. Reads require `assets.view`;
writes are gated per operation (see below). Ids that do not exist **or belong to another
organisation** answer `404 NOT_FOUND`.

### Asset categories

- GET `/asset-categories` — permission `assets.view`.
  `200 AssetCategoryPublic[]` (`{ "id", "organisationId", "name", "description",
"assetCount", "createdAt", "updatedAt" }`)
- POST `/asset-categories` — permission `assets.create`. Body: `{ "name",
"description"? }`.
  `201` · `400 VALIDATION_ERROR` · `409 CONFLICT` (name already used in this organisation)
- PATCH `/asset-categories/:id` — permission `assets.update`. Body: `{ "name"?,
"description"? }`. `200` · `404` · `409 CONFLICT` (duplicate name)
- DELETE `/asset-categories/:id` — permission `assets.delete`.
  `200 { "data": null }` · `404` · `409 CONFLICT` (category still assigned to assets)

### Locations

- GET `/locations` — permission `assets.view`.
  `200 LocationPublic[]` (`{ "id", "organisationId", "name", "code", "assetCount", ... }`)
- POST `/locations` — permission `assets.create`. Body: `{ "name", "code"? }`.
  `201` · `400` · `409 CONFLICT` (duplicate name)
- PATCH `/locations/:id` — permission `assets.update`. Body: `{ "name"?, "code"? }`.
  `200` · `404` · `409 CONFLICT` (duplicate name)
- DELETE `/locations/:id` — permission `assets.delete`.
  `200` · `404` · `409 CONFLICT` (location still holds assets)

### Asset CRUD

- GET `/assets` — permission `assets.view`. Query parameters:
  `page` (≥1, default 1), `limit` (1–100, default 20), `q` (case-insensitive match on
  name, asset tag, serial number or barcode), `status` (`available|assigned|retired`),
  `categoryId`, `locationId`, `assignedTo` (user id), `sortBy`
  (`createdAt|name|assetTag`, default `createdAt`), `sortDir` (`asc|desc`, default `desc`).
  `200 Paginated<AssetPublic>` — `{ "items", "page", "limit", "total", "totalPages" }`.
  Hydrated rows carry `categoryName`, `locationName` and `assignedToName`.
- POST `/assets` — permission `assets.create`. Body: `{ "name", "assetTag",
"description"? , "categoryId"?, "locationId"?, "serialNumber"?, "condition"? }`.
  `barcode` is generated equal to `assetTag` and frozen afterwards (the QR payload).
  `201 AssetPublic` · `400` · `404` (unknown category/location in this organisation) ·
  `409 CONFLICT` (duplicate asset tag or serial number)
- GET `/assets/:id` — permission `assets.view`. `200 AssetPublic` · `404`
- PATCH `/assets/:id` — permission `assets.update`. Body: same fields as create, all
  optional. `200` · `400` · `404` · `409 CONFLICT` (duplicate tag/serial)
- DELETE `/assets/:id` — permission `assets.delete`. Only assets without assignment or
  transfer history can be deleted; anything that has been in use must be retired instead.
  `200 { "data": null }` · `404` · `409 CONFLICT` (asset has history)

### Lifecycle

Status transitions are enforced server-side (`available → assigned → available`,
`available → retired`); every transition writes an immutable history record.

- POST `/assets/:id/assign` — permission `assets.assign`. Body:
  `{ "assignedToUserId", "notes"? }`. Target must be a member of the organisation.
  `200 AssetPublic` (status `assigned`) · `400` · `404` ·
  `409 CONFLICT` (already assigned / retired / target is not a member)
- POST `/assets/:id/return` — permission `assets.assign`. Body:
  `{ "condition"? , "notes"? }`. Closes the open assignment and updates the condition.
  `200` (status `available`) · `400` · `404` · `409 CONFLICT` (not currently assigned)
- POST `/assets/:id/transfer` — permission `assets.transfer`. Body:
  `{ "toUserId", "notes"? }`. Moves custody to another member without leaving
  `assigned`. `200` · `400` · `404` · `409 CONFLICT` (not assigned / same person /
  target is not a member)
- POST `/assets/:id/retire` — permission `assets.update`. Body: `{ "reason"? }`.
  Only available assets can be retired. `200` (status `retired`) · `400` · `404` ·
  `409 CONFLICT` (assigned — return it first / already retired)

### History

- GET `/assets/:id/history` — permission `assets.view`.
  `200 { "assignments": AssetAssignmentPublic[], "transfers": AssetTransferPublic[] }`,
  newest first. Assignment and transfer records are append-only: closing an assignment
  sets `returnedAt`/`returnedByName`/`returnCondition` once and never rewrites
  `assignedAt`, `assignedToUserId` or the acting users. Transfers never modify
  assignment rows — they close the open row and open a new one.
- GET `/assets/:id/maintenance` — planned (later phase)
- POST `/assets/:id/documents` — planned (later phase)

## Inventory

- GET `/products`
- POST `/products`
- GET `/products/:id`
- PATCH `/products/:id`
- GET `/inventory`
- POST `/inventory/adjust`
- GET `/stock-movements`
- GET `/warehouses`
- POST `/warehouses`
- POST `/stock-transfers`
- GET `/stock-transfers/:id`

## Purchasing

- GET `/suppliers`
- POST `/suppliers`
- GET `/purchase-orders`
- POST `/purchase-orders`
- GET `/purchase-orders/:id`
- PATCH `/purchase-orders/:id`
- POST `/purchase-orders/:id/approve`
- POST `/purchase-orders/:id/receive`

## Maintenance

- GET `/maintenance`
- POST `/maintenance`
- GET `/maintenance/:id`
- PATCH `/maintenance/:id`

## Reports

- GET `/reports/inventory`
- GET `/reports/assets`
- GET `/reports/purchasing`
- GET `/reports/maintenance`

## Notifications

- GET `/notifications`
- POST `/notifications/:id/read`
- POST `/notifications/read-all`

## Audit

- GET `/audit-logs`

## API rules

- Validate every request.
- Enforce authentication.
- Enforce permission checks.
- Enforce tenant isolation.
- Paginate list endpoints.
- Support filtering and sorting where appropriate.
- Never return secrets.
- Use appropriate HTTP status codes.
- Return predictable error structures.
