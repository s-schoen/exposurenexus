# OpenVLP API

Hono.js API Server

## Tech Stack

* Hono.js
* `better-auth` for authentication
* `kysely` as query builder for PostgreSQL
* `zod/v4` for validation

## Commands

* Use `pnpm`, NEVER use `npm` or `yarn`
* `pnpm build` to build code with `tsc` and check for syntax errors
* `pnpm lint` to lint code with `eslint`
* `pnpm test` to run unit tests with `vitest`

## Patterns

* Use the repository pattern as appropriate
* Do not implement business logic in the API routes, but abstract into services
* Always use structured logging, use audit logging for sensitive operations
* Use `vitest` for unit tests
* Place test files directly adjacent to the source files they cover, do not use a separate `test/` directory
