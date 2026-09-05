# Service Layer Throws Application Errors

Domain services throw typed `ApplicationError`s instead of HTTP errors, and the
API adapter converts those errors into HTTP replies at the boundary. This keeps
business behavior independent of Hono.
[ADR-0004](0004-shared-backend-capabilities.md) places this behavior and typed
errors in the shared backend, with API adapters owning HTTP translation;
services and persistence are backend internals.

`ApplicationError` uses a centrally typed, code-keyed catalog. Each code defines
the error kind and any internal structured details it may carry. Services use
these codes for stable diagnostics and tests, while route adapters keep existing
`null` service contracts for intentional "maybe found" and authentication
validation outcomes.

HTTP status codes and client-facing error reasons are owned by the API layer.
The mapper must explicitly allowlist public reasons instead of exposing every
application error code automatically, so sensitive cases such as authentication
or session failures can collapse detailed internal causes into safe public
reasons.

## HTTP Exposure Rules

`ApplicationError.kind` maps to HTTP status at the API boundary:
`validation` becomes 400, `missing` becomes 404, `denied` becomes 403,
`conflict` becomes 409, and `unexpected` becomes 500. Status mapping is not
configured per code.

For `ApplicationError`s, the public `error` text uses the application error
message for non-`unexpected` kinds. `unexpected` errors always expose the
generic `internal server error` message instead of the internal diagnostic
message.

Public `reason` values are exposed only when an API-layer response policy
explicitly allowlists the application error code. The policy may return a static
reason or derive one from typed error details for that specific code. Internal
`details` are never serialized by default.

## Consequences

- Services no longer import HTTP error helpers for application failures.
- The API error mapper becomes the single place that translates application
  error kinds to HTTP status codes.
- Internal error details are not serialized by default.
- Adding a new thrown service error requires adding a typed catalog entry and,
  when appropriate, an explicit public reason mapping.
