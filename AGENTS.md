# ExposureNexus

ExposureNexus is a fullstack open-source CTEM application for managing security findings imported from different
sources.

## Tech Stack

- `pnpm` Monorepo
    - `apps/api`: API Server based on Hono
    - `apps/ui`: React frontend
    - `packages/types`: Types common to both apps

## Commands

- Always use `pnpm`, NEVER use `npm` or `yarn`
- Use `pnpm lint` to run linter on all workspaces
- Use `pnpm build` to build all workspaces and check for TypeScript errors

## Agent skills

### Issue tracker

Issues are tracked as local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-state triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
