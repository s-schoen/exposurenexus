# OpenVLP API

Hono.js API Server

## Tech Stack

- Hono.js
- `kysely` as query builder for PostgreSQL
- `zod/v4` for validation

## Commands

- Use `pnpm`, NEVER use `npm` or `yarn`
- `pnpm build` to build code with `tsc` and check for syntax errors
- `pnpm check` to lint code with `eslint`
- `pnpm typecheck` to type-check production source files without emitting build output
- `pnpm typecheck:test` to type-check test files without building them for production
- `pnpm typecheck:all` to run both production and test type checks
- `pnpm test` to run unit tests with `vitest`
- `pnpm test:coverage` to generate coverage reports on stdout

## Patterns

- Use the repository pattern as appropriate
- Do not implement business logic in the API routes, but abstract into services
- Always use structured logging, use audit logging for sensitive operations
- Use `vitest` for unit tests
- Place actual `*.test.ts` files directly adjacent to the source files they cover
- Put shared test helpers and fixtures in `src/test/`
- Use TDD for all newly implemented features by default
- Start feature work by adding a unit test that fails for the intended behavior
- Only implement the feature after the new unit test is in place and failing
- Do not finish feature work until the new unit test and the existing unit test suite both pass
