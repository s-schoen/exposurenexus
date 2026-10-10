# ExposureNexus Web User Interface

## Commands

- Use `pnpm`, NEVER use `npm` or `yarn`
- `pnpm build` to build code with `tsc` and check for syntax errors
- Run `pnpm lint` from the repository root to lint with Oxlint
- Run `pnpm format:check` from the repository root to verify Oxfmt formatting
- `pnpm test` to run the Vitest suite; pass a file path after `--` to target an individual test file
- `pnpm test:coverage` to run the test suite with coverage output
- `pnpm test:e2e` to run the Playwright browser smoke tests (starts `pnpm dev:mock` unless one is already running on
  port 3000; install the browser once with `pnpm exec playwright install chromium`)
- `pnpm dev:mock` to run the UI against the in-browser MSW mock API (no API server or database); pick a seed with
  `?mockScenario=empty` or `?mockScenario=loggedOut`

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

## Resource Mutation Policy

- API-backed domain resource mutations must go through resource lifecycle hooks unless the code is explicitly non-resource
  infrastructure or the exception is documented near the call site.
- Put lifecycle hooks in `src/hooks/` and name them `use<Resource>Lifecycle`, with files named like
  `use-finding-lifecycle.ts`.
- Keep `src/api/*` mutation hooks as low-level transport wrappers. Production route and component code should not call
  `useCreateXMutation`, `useUpdateXMutation`, or `useDeleteXMutation` directly for resource mutations.
- Lifecycle hooks own mutation calls, optimistic cache writes, rollback, query invalidation, default success/error toasts,
  error logging, and structured success/failure results. Transport functions in `api/*.ts` throw without logging; failed
  queries are logged once by the `QueryCache` in `src/lib/query-client.ts` (401s go to the unauthorized handler instead).
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
- Resource mutations include findings, observations, finding-to-vulnerability catalog links, assets and asset ownership,
  asset custom field definitions/assignments/values, vulnerabilities, users, and roles.
- Keep the UI import page disabled. The API accepts metadata and bytes and the worker only reads/logs input; this is not
  imported observations. See `docs/import-sources.md` before changing the import workflow.
- Exceptions include auth/session cache clearing, pure local UI state, form validation and draft state, clipboard actions,
  dialogs, filters, search params, and tests. Tests seed API-backed state in the mock DB; hook tests may also seed
  query cache entries to check what gets invalidated.

## Mock API and Fixtures

- `src/mocks/` is the single mock backend for tests and `pnpm dev:mock`: MSW handlers in `src/mocks/handlers/` over an
  in-memory DB (`src/mocks/db.ts`) seeded from `src/mocks/fixtures/seed.ts`. Handlers mirror the real API: reply
  envelopes and error messages, 201 on create, 404 for unknown ids, 401 without a session, 403 when the signed-in
  user's roles lack the route's permission, 409 for conflicts (duplicates, deleting a referenced asset or an assigned
  role), and request bodies validated with the contracts schemas. To test a denied request, sign in as a user with
  fewer roles: `db.session = buildAuthSession(user)`.
- Build sample data with `buildX(overrides)` from `@/mocks/fixtures` (deterministic ids, names and dates). Pass
  relations explicitly, e.g. `buildFinding({ assetId: asset.id })`. Use the `SEED_*` records when a test needs data the
  default scenario already serves.
- When the API gains or changes an endpoint, update its handler and builder in the same change. Keep
  `src/mocks/fixtures/fixtures.test.ts` and `src/mocks/handlers/handlers.test.ts` passing; they catch drift from
  contracts.

## Tests

- Tests run against the MSW mock API (`src/test/setup.ts`); any unmocked request fails the test, and the mock DB
  resets after each test. Shared jsdom polyfills live in `src/test/dom-polyfills.ts`.
- Test each feature by behavior in `src/features/<feature>/pages/<feature>.app.test.tsx`, rendering whole pages with
  `renderApp({ path, scenario })` from `@/test/render-app.tsx` (real router, queries and lifecycle hooks). Assert what a
  user sees, the URL (`router.state.location`) and the mock data (`db`), not props or spy calls. See
  `src/features/roles/pages/roles.app.test.tsx`.
- Render single components with `renderWithAppProviders` and hooks with `renderHookWithApp` from `@/test/harness.tsx`.
  Lifecycle hook tests cover only what pages cannot show: return values, which cached reads are invalidated, and batch
  summaries.
- Set up and observe state through the mock API with the helpers in `@/test/msw.ts`: `db`, `seedScenario`,
  `mockApiError(method, path, status)` (use a literal id path to fail one item), `holdApiResponses` for pending states,
  `recordApiRequests` and `captureApiCalls` for request assertions, and `mockApiReply` for malformed replies.
- Passing tests print nothing. `mockApiError` also declares the app's error log for that failure as expected; declare
  other expected errors or warnings with `expectConsoleLog(text)` from `@/test/console.ts`. Unavoidable third-party
  warnings go in its `IGNORED_WARNINGS`, with a reason. The render helpers cancel their queries when a test ends, so no
  request outlives its test.
- When a rule has many input combinations (payload mapping, metrics, search-param parsing), extract it into a pure
  function under `lib/` and test the combinations there; keep one or two representative UI flows in the app test.
- Do not `vi.mock` `@tanstack/react-query`, feature `api`/`queries`/`mutations`/`hooks` modules, or
  `@/hooks/use-page-meta.tsx`, and do not stub `fetch`. Allowed mocks: `createFileRoute` in route loader tests to read
  route options, `sonner` in hook tests, and jsdom-hostile primitives (recharts, the Base UI select or context menu) in
  tests of components that take their data as props.
- Every new app-owned component should be covered: by its feature app test, or by a colocated `*.test.tsx` for
  reusable components and pure logic.
- Use unit tests to assert user-visible behavior and core interactions.
- For simple display components, test the primary render states.
- For interactive components, test the key user flows, such as typing, selecting, submitting, clearing,
  and loading or error transitions.
- Prefer user-visible assertions over implementation-detail assertions. Only assert data attributes or internal markers
  when they are the intentional public output of the component.
- Keep tests robust by preferring roles, labels, button types, callback effects, row counts, and state changes over exact
  button copy, placeholder copy, or decorative text whenever that text is not the behavior being tested.
- Only assert concrete text when the text itself is the user-visible output under test, such as filtered row values,
  sorted row order, validation messages, or submitted data.
- When a third-party UI primitive is hard to drive reliably in jsdom, prefer a minimal harness that exercises the
  component through its real public API instead of brittle DOM-structure assertions.
- If a component needs a browser API that jsdom lacks, add the smallest polyfill to `src/test/dom-polyfills.ts` when
  many tests need it, otherwise to the test file.
- Validate new component work with root `pnpm lint` and `pnpm test`. Use `pnpm test:coverage` when you need a coverage
  report.

## Browser smoke tests

- `e2e/*.spec.ts` drive the real UI in Chromium with Playwright against `pnpm dev:mock`, so they share the MSW handlers
  and seed data with Vitest. Import seed records from `@/mocks/fixtures` instead of repeating names and ids.
- Add a journey only when a real browser is needed (charts, Base UI selects, dialogs and comboboxes, file inputs, real
  typing into URL-driven inputs, render loops) or for a flow across pages. Everything else belongs in a Vitest app test.
  Keep the suite small: a few journeys per area.
- Import `test` and `expect` from `e2e/fixtures.ts`. Its console guard fails a test on any console error, warning or
  uncaught error the test did not declare with `consoleGuard.allow(pattern)`; React's "Maximum update depth exceeded"
  always fails.
- Mock data lives in memory per page load. Start with one `page.goto`, then navigate client-side (clicks), or a write is
  lost. Pick a seed with `?mockScenario=empty|loggedOut` on that first URL.
- Use role and label locators, as in the Vitest tests. The app shell nests the page's `<main>` inside its own; scope
  to `pageContent(page)` when text could also appear in the shell.
