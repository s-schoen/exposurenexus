# API Authentication Design

ExposureNexus uses a custom API authentication system built around user profiles,
opaque server-side sessions, and role-based authorization. The design replaces
the previous better-auth integration for API authentication while keeping the
authentication state and permission model inside ExposureNexus-owned tables and
services.

This document describes the architecture, data flow, and security controls. It
is not an endpoint reference.

## Goals

- Keep authentication state server-side and opaque to clients.
- Avoid storing raw session tokens in the database.
- Keep user identity, role assignments, and permissions in ExposureNexus-owned
  domain tables.
- Enforce authorization through service-level permission checks instead of
  better-auth role conventions.
- Make sensitive account and RBAC changes invalidate affected sessions.
- Keep authentication and authorization behavior auditable.

## Main Components

The authentication system is split across route, middleware, service, and
repository layers.

- `routes/auth.ts` handles login, session reads, and logout behavior. It reads
  request metadata, sets and clears cookies, and delegates all authentication
  decisions to the auth service.
- `service/auth.ts` owns credential checks, session creation, session
  validation, session revocation, and permission checks.
- `middleware/auth.ts` annotates each request with the current `UserProfile`
  and `UserSession` when a valid session cookie is present. It also provides
  middleware for requiring authentication and domain permissions.
- `middleware/csrf.ts` protects cookie-authenticated unsafe requests using
  Fetch Metadata, Origin checks, and a signed CSRF token.
- `repository/user-profile.ts`, `repository/user-session.ts`, and
  `repository/user-role.ts` persist users, sessions, role assignments, and
  permissions.

Shared user and session shapes live in `packages/types`, so route replies and
service boundaries use the same domain concepts.

## Data Model

User identity is stored in `user_profile`.

Important fields include:

- `username`
- `email`
- `displayName`
- `enabled`
- `passwordHash`

Role assignments are stored separately in `user_role_assignment`. Permissions
are resolved dynamically through the user's assigned roles and
`role_permission_assignment`.

Sessions are stored in `user_session`.

Important fields include:

- `sessionId`: HMAC-SHA-256 digest of the public session token
- `userId`
- `sourceIp`
- `userAgent`
- `createdAt`
- `expiresAt`

The raw public session token is only returned to the client as a cookie. It is
never persisted directly.

## Login Flow

Login starts in the auth route and then moves into the auth service.

1. The route validates the login payload.
2. The route resolves request metadata:
   - source IP
   - user agent
3. The route calls `createSessionForCredentials`.
4. The auth service loads the user profile by username.
5. The submitted password is verified with Argon2 against the stored
   `passwordHash`.
6. Disabled users and invalid credentials are rejected.
7. A random opaque session token is generated.
8. The token is HMAC-SHA-256 hashed with `AUTH_SECRET`.
9. Only the digest is stored in `user_session`.
10. The raw session token is set in the `__Host-exposurenexus-session` cookie.
11. A signed CSRF token is issued in the `__Host-exposurenexus-csrf` cookie.

The auth service uses a dummy Argon2 hash when a username does not exist. This
keeps credential checks closer in timing between existing and non-existing
users and reduces username enumeration risk.

## Session Validation Flow

For normal API requests, authentication is handled by middleware before route
handlers run.

1. `createAuthAnnotate` reads the `__Host-exposurenexus-session` cookie.
2. If no cookie exists, the request context receives `user = null` and
   `session = null`.
3. If a cookie exists, the auth service HMACs the presented token and looks up
   the digest in `user_session`.
4. The service rejects missing or expired sessions.
5. The service reloads the user profile and rejects disabled or missing users.
6. Valid sessions annotate the Hono context with:
   - `user`: the current `UserProfile`
   - `session`: the current `UserSession`

Routes can then require authentication with `authNRequire` or require specific
permissions with domain permission middleware.

## Logout And Revocation

Logout deletes the current session row by digest and clears the session and CSRF
cookies.

Session revocation is also triggered by sensitive account and authorization
changes:

- password changes
- disabling a user
- changing a user's role assignments
- changing permissions on an assigned custom role

These revocations happen in the same database transaction as the sensitive
write where possible. This prevents a password or permission change from being
committed while old sessions remain active.

ExposureNexus stores only HMAC digests of session tokens. Because the raw token cannot
be recovered from the database, the system does not try to transparently rotate
arbitrary existing sessions. Revocation is stricter: affected users must
authenticate again and receive a new session token through the normal login
flow.

## Authorization Flow

Authorization is role-based but checked through ExposureNexus's own RBAC model.

1. A route declares the required domain permission.
2. The permission middleware requires an authenticated user.
3. The middleware calls `authService.userHasPermission`.
4. The auth service loads all distinct permissions assigned to the user through
   their roles.
5. The required resource/verb set must be fully covered by the assigned
   permissions.

Permissions are resolved dynamically from the database. This means role and
permission changes are reflected without embedding authorization data inside
the session cookie.

## CSRF Protection

Authentication uses cookies, so unsafe requests need CSRF protection.

The CSRF middleware applies to unsafe methods and uses several controls:

- Fetch Metadata rejects cross-site unsafe requests when browser metadata is
  present.
- Origin validation requires unsafe requests to come from a configured allowed
  origin.
- Authenticated unsafe requests, except login, must include a CSRF header whose
  value matches the CSRF cookie.
- CSRF tokens are signed with HMAC-SHA-256 using the session database ID, a
  nonce, and `AUTH_SECRET`.
- Token comparisons use timing-safe equality.

The CSRF cookie is readable by frontend code so it can be copied into the
`X-CSRF-Token` header. The session cookie remains `HttpOnly`.

## Cookie Policy

The session cookie is named `__Host-exposurenexus-session`.

The CSRF cookie is named `__Host-exposurenexus-csrf`.

Both cookies use the `__Host-` prefix constraints:

- `Secure`
- `Path=/`
- no `Domain`

The session cookie is also `HttpOnly`. Cookies use `SameSite=Lax`; this is
treated as defense-in-depth and is not the only CSRF control.

`AUTH_COOKIE_SECURE` must be true. The API fails fast if secure cookie behavior
is disabled because `__Host-` cookies require `Secure`.

## Source IP Handling

Login stores source IP metadata with the session for audit and investigation.

The route starts from the actual connection remote address reported by Hono's
Node server integration. Forwarding headers are only trusted when that remote
address matches `AUTH_TRUSTED_PROXIES`.

Accepted trusted proxy entries are exact IPs or CIDRs, for example:

```env
AUTH_TRUSTED_PROXIES=127.0.0.1,10.0.0.0/8,2001:db8::/32
```

If the remote address is trusted, ExposureNexus considers `X-Forwarded-For` first and
then `X-Real-IP`. If the remote address is not trusted, forwarding headers are
ignored to avoid spoofed session metadata.

## Auditing

The authentication system logs security-relevant lifecycle events:

- successful and failed credential checks
- session creation
- session validation failures
- session revocation
- sensitive user profile updates that revoke sessions
- role permission updates that revoke affected sessions

Logs include stable identifiers such as user profile IDs, session IDs from the
database, revocation reasons, affected user counts, and revoked session counts
where available. Raw session tokens and plaintext passwords are never logged.

## Configuration

Authentication-related configuration is provided through environment variables.

- `AUTH_SECRET`: HMAC secret for session digests and CSRF token signatures. It
  must be at least 32 characters.
- `AUTH_SESSION_LIFETIME`: absolute session lifetime in hours.
- `AUTH_COOKIE_SECURE`: must be `true` for `__Host-` cookie behavior.
- `AUTH_TRUSTED_PROXIES`: comma-separated exact IPs or CIDRs whose forwarding
  headers may be trusted.
- `CORS_ORIGIN`: expected browser origin and CSRF Origin allowlist entry.

## Security Properties

The custom authentication system is designed around the following controls:

- Passwords are stored as Argon2 hashes.
- Credential checks use a dummy hash for missing users to reduce timing-based
  username enumeration.
- Session tokens are high-entropy random values.
- Session tokens are opaque and contain no user data.
- Only HMAC-SHA-256 session digests are stored in the database.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, path-scoped to `/`,
  and use the `__Host-` prefix.
- CSRF protection combines Fetch Metadata, Origin checks, and signed double
  submit tokens.
- CSRF token comparison uses timing-safe equality.
- Authorization is evaluated against current database permissions rather than
  session-embedded claims.
- Sensitive user and RBAC changes revoke affected sessions.
- Forwarded client IP headers are ignored unless the immediate source is a
  configured trusted proxy.

## Current Boundaries

This design intentionally keeps authentication server-side. The browser only
stores opaque cookies and does not receive role or permission claims to enforce
security decisions.

The UI is expected to:

- send credentialed requests to the API
- copy the CSRF cookie into `X-CSRF-Token` for unsafe authenticated requests
- treat 401 responses as a signal that the session is missing, expired, or
  revoked

The API remains the authority for identity, session validity, and permissions.
