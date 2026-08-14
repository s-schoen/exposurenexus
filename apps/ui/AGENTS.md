# ExposureNexus Web User Interface

## Commands

- Use `pnpm`, NEVER use `npm` or `yarn`
- `pnpm build` to build code with `tsc` and check for syntax errors
- Run `pnpm lint` from the repository root to lint with Oxlint
- Run `pnpm format:check` from the repository root to verify Oxfmt formatting
- `pnpm test` to run the full Vitest suite
- `pnpm test:unit` to run unit tests only; pass a file path after `--` to target an individual test file
- `pnpm test:coverage` to run the test suite with coverage output
- `pnpm storybook` to run Storybook locally
- `pnpm build-storybook` to build the static Storybook site

## Code Style & Conventions

Do NOT commit any changes to git unless you are explicitly asked.

- **Framework**: React 19 + Vite + TypeScript.
- **Routing**: @tanstack/react-router (File-based routing in `src/routes`).
- **Route architecture**: Keep `src/routes` files as thin router adapters. Route files should own route configuration,
  guards, search validation, params/search/context reads, and prop adaptation only. Put substantial screen/page UI in
  feature components under `src/features/<feature>/components` and name full route screens `*-page.tsx`. Do not export a
  component from a route file when that component is assigned to `component:`, `errorComponent:`, `pendingComponent:`, or
  `notFoundComponent:` because exported route components are not automatically code-split. TanStack Router `-` ignored
  files are allowed for rare route-private helpers that must stay under `src/routes`, but prefer feature folders for
  reusable or testable screen logic.
- **State**: @tanstack/react-query for async data.
- **Styling**: ShadCN components with Tailwind CSS. Use `cn()` helper from `@/lib/utils` to merge classes.
- **UI Components**: shadcn UI primitives located in `src/components/ui`.
- **Imports**: ALWAYS use absolute imports with `@/` alias (e.g., `import { Button } from "@/components/ui/button"`).
  Generated files such as `src/routeTree.gen.ts` are exempt and may keep generator-produced relative imports.
- **Naming**: kebab-case for components (`my-button.tsx`), camelCase for helpers (`utils.ts`).
- **Storybook**: Always create or update a Storybook story for new app-owned components. Prefer colocated
  `*.stories.tsx` files that cover the component's primary visual states. Do not add stories for shadcn internal
  primitives in `src/components/ui` unless explicitly requested.

## Resource Mutation Policy

- API-backed domain resource mutations must go through resource lifecycle hooks unless the code is explicitly non-resource
  infrastructure or the exception is documented near the call site.
- Put lifecycle hooks in `src/hooks/` and name them `use<Resource>Lifecycle`, with files named like
  `use-finding-lifecycle.ts`.
- Keep `src/api/*` mutation hooks as low-level transport wrappers. Production route and component code should not call
  `useCreateXMutation`, `useUpdateXMutation`, or `useDeleteXMutation` directly for resource mutations.
- Lifecycle hooks own mutation calls, optimistic cache writes, rollback, query invalidation, default success/error toasts,
  error logging, and structured success/failure results.
- Routes own confirmation dialogs and post-success navigation. Components own local draft state, validation, and rendering.
- Lifecycle hook actions should accept API/domain payloads or domain records, not screen-specific form values.
- Single-resource lifecycle actions should return the affected resource on success and `null` for handled API failures.
  Batch actions should return `{ successful, failed }` and show one summary toast.
- Optimistic cache writes are opt-in per operation. Use them for inline edits where pending stale UI is jarring, and always
  snapshot and roll back every cache entry touched by the optimistic write.
- Invalidate known query keys with `exact: true` by default. Use broad/prefix invalidation only when intentionally
  invalidating a resource subtree, preferably behind a clearly named helper.
- Keep resource-specific cache helpers private inside the lifecycle hook until multiple lifecycle hooks genuinely need a
  shared abstraction.
- Cross-resource invalidation belongs in the lifecycle hook for the mutation being performed. Hooks may import other
  resources' query option factories to invalidate affected reads, but should not call other lifecycle hooks just to reuse
  invalidation.
- Resource mutations include findings, assets and asset ownership, asset custom field definitions/assignments/values,
  vulnerabilities and vulnerability source mappings, users, roles, imports, and reclassification flows when they affect
  resource reads.
- Exceptions include auth/session cache clearing, pure local UI state, form validation and draft state, clipboard actions,
  dialogs, filters, search params, tests, and stories. Test and Storybook harnesses may seed or update query caches to
  simulate API-backed state without going through lifecycle hooks.

## Component Tests

- Every new app-owned component should include a colocated Storybook story and a colocated unit test from now on.
- Treat the story file as the source of truth for component states, sample data, and test harness setup.
- Prefer colocated `*.test.tsx` files that import the stories with `composeStories` from `@storybook/react-vite`.
- Use unit tests to assert user-visible behavior and core interactions. Do not duplicate those assertions in story
  `play` functions unless the `play` function adds real value to the Storybook demo itself.
- Keep `play` functions only for interactions that are useful to demonstrate inside Storybook.
- For simple display components, test the primary render states from the stories.
- For interactive components, test the key user flows from the stories, such as typing, selecting, submitting, clearing,
  and loading or error transitions.
- Prefer user-visible assertions over implementation-detail assertions. Only assert data attributes or internal markers
  when they are the intentional public output of the component.
- Keep tests robust by preferring roles, labels, button types, callback effects, row counts, and state changes over exact
  button copy, placeholder copy, or decorative text whenever that text is not the behavior being tested.
- Only assert concrete text when the text itself is the user-visible output under test, such as filtered row values,
  sorted row order, validation messages, or submitted data.
- When a third-party UI primitive is hard to drive reliably in jsdom, prefer a minimal harness that exercises the
  component through its real public API instead of brittle DOM-structure assertions.
- If a component needs browser APIs that jsdom does not provide, add the smallest possible test-local polyfill in the
  test file.
- Validate new component work with root `pnpm lint` and `pnpm test`. Use `pnpm test:coverage` when you need a coverage
  report.
