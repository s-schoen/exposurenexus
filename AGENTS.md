# OpenVLP

OpenVLP (Open Vulnerability Lifecycle Platform) is a fullstack application to manage vulnerability that can be
imported from different sources.

## Tech Stack

* `pnmp` Monorepo
    * `apps/api`: API Server based on Hono
    * `apps/ui`: React frontend
    * `packages/types`: Types common to both apps

## Commands

* Always use `pnmp`, NEVER use `npm` or `yarn`
* Use `pnpm lint` to run linter on all workspaces
* Use `pnpm build` to build all workspaces and check for TypeScript errors