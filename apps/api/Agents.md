# OpenVLP API

Hono.js API Server

## Tech Stack

* Hono.js
* `better-auth` for authentication
* `kysely` as query builder for PostgreSQL
* `zod/v4` for validation

## Patterns

* Use the repository pattern as appropriate
* Do not implement business logic in the API routes, but abstract into services
* Always use structured logging, use audit logging for sensitive operations
* Do not implement unit tests