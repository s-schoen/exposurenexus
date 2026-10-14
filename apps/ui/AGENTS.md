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
- **Styling**: ShadCN components with Tailwind CSS. Use `cn()` helper from `@/lib/utils` to merge classes. Design-system
  rules are under [Styling](#styling).
- **UI Components**: shadcn UI primitives located in `src/components/ui`.
- **Imports**: ALWAYS use absolute imports with `@/` alias (e.g., `import { Button } from "@/components/ui/button"`).
  Generated files such as `src/routeTree.gen.ts` are exempt and may keep generator-produced relative imports.
- **Naming**: kebab-case for components (`my-button.tsx`), camelCase for helpers (`utils.ts`).

## Styling

`pnpm lint` checks styling with `@shadcn/lint`; its rules and per-component contracts live in `.oxlintrc.json`, and
every finding ends with a pointer to this section.

- A `className` on a component from `src/components/ui` sets layout only: margin, size, position, flex and grid
  placement. Contracts in `.oxlintrc.json` widen this for a few components, such as spacing on card and popover slots.
- Fix a finding with the first of these that fits: an existing variant or size; only the layout classes; decoration
  moved to a plain wrapper element; a wider contract in `.oxlintrc.json`; a new variant in `src/components/ui` for a
  look that repeats; a new token in `src/styles.css`.
- Colors come from the theme tokens in `src/styles.css` (`bg-primary`, `text-success`, `bg-severity-high/10`). Status,
  role and severity colors use `success`, `warning`, `info`, `severity-*` and `finding-status-*`, through Badge
  variants or the domain badges.
- Domain badges (`src/features/*/components/*-badge.tsx`) own their Badge styling and color lookups. Keep each lookup a
  same-file `const` object so the linter reads its classes.
- Mark an approved exception with `// oxlint-disable-next-line shadcn/<rule> -- <reason>`; the lint config ignores
  `eslint-disable` comments.

### Design principles

The UI follows Plane's look (palette, surfaces, density, type) with Twenty's motion timings. Plane and Twenty are
AGPL-3.0: re-declare single values under our token names, never copy their files.

- **Surfaces:** two planes. The gray canvas (`bg-background`) frames the app, and one white sheet (`bg-card`) holds the
  sidebar and content. Build hierarchy from `border-border` hairlines and gray trays (`bg-muted`) holding white rows or
  cards. Shadows belong to floating surfaces only (`shadow-overlay` on popups, `shadow-peek` on the peek panel), plus
  `shadow-raised` on dashboard KPI cards. Hover is `bg-accent`, active nav and tab pills `bg-layer-selected`, a selected
  row (peeked or checked) `bg-primary/5`.
- **Tokens:** text has four levels: `text-foreground` for titles and values, `text-foreground-secondary` for nav, body and
  chip text, `text-muted-foreground` for property labels and counts, `text-subtle-foreground` for section labels,
  timestamps and placeholders. Borders: `border-border` for hairlines, `border-input` for inputs, `border-border-strong`
  for outline buttons, chips and checkboxes. Panels and cards stay neutral; tinted pills (a role, an asset type) are the
  only tinted backgrounds.
- **Control ladder:** controls are h-7 by default, h-6 small and h-8 for inputs and the sidebar CTA. Controls and chips
  are `rounded-md`; cards, the sheet and popovers `rounded-lg`. Pages pad `px-5`, the page header is `h-13`, list rows
  are `min-h-11`. Lucide icons use `strokeWidth={1.5}`: 16px in nav and buttons, 14px in chips.
- **Type:** Inter at weights 450/500/600 and IBM Plex Mono for identifiers, digests, hashes and keys (CVE ids, custom
  field and metadata keys, asset identifiers, usernames), everywhere they appear, including the `Input` that edits them
  (`className="font-mono"`). A weakness identifier reads through `formatWeaknessIdentifier`, which doesn't repeat its
  namespace ("CWE-284", not "cwe CWE-284"). `text-13` is the dense
  UI size (nav, rows, property rows, menus, buttons), `text-sm` the reading size, `text-xs` chips and timestamps,
  `text-base font-medium` the page header title, `text-2xl` detail and settings titles and KPI numbers. Labels are
  sentence case with default tracking; section labels are `text-13 font-semibold text-subtle-foreground`.
- **Motion:** opacity first and short. Popups fade (`transition-opacity duration-150 ease-out`, with
  `data-starting-style:opacity-0 data-ending-style:opacity-0`); dialogs fade over `duration-300`. Movement is for things
  that travel: the peek slide (`ease-snappy`), the sidebar mode switch (`animate-nav-enter`), collapsibles
  (`ui/collapsible`, `h-collapsible-panel`) and chevrons. Hover backgrounds use
  `transition-colors duration-100`; hover-revealed controls fade in over `duration-75`. Route changes are instant. The
  reduced-motion rule in `src/styles.css` zeroes every duration, so new motion needs no extra handling.
- **Text budget:** each fact appears once per view. Pages, cards and nav items carry a title only; empty states get one
  short sentence and one action; dialogs carry a description only when the action is destructive. Labels are muted,
  values dark. A list row's leading slot carries its primary classifier (severity for findings and vulnerabilities,
  type for assets and custom fields, avatar for users, `RoleKindIcon` for roles), and no property chip repeats it: the
  column stays, without a `placement`, to filter, group and order.
- **Domain icons:** severity and finding status read through their icons and color tokens: `SeverityIcon`,
  `FindingStatusIcon` and the `SeverityBadge` / `FindingStatusBadge` property chips (`Badge variant="property"`). Color
  lives in icons, dots and numbers. A dashboard number turns `text-destructive` only for a problem and `text-success`
  only for a good outcome. Every picker for severity or status, whether a `Select`, `PropertySelect` or filter, shows
  icon + label (`SeverityLabel`, `FindingStatusLabel`) in its trigger and options, ordered by `SEVERITY_ORDER` /
  `STATUS_ORDER`. Chips are for read-only display, never inside a picker. Every finding status has its own glyph; the
  cancelled group (false positive, duplicate, out of scope) shares Plane's filled circle and color. An asset shows
  `AssetTypeIcon` for its real type wherever it appears (chips, group headers, links), and type pickers show
  `AssetTypeIcon` / `CustomFieldTypeIcon` with the label. Status-like flags use icon + label in list chips, property
  values and form `Select`s alike, never a dot, plain text, "Yes" or a checkbox: `UserStatusLabel`,
  `AssetLifecycleLabel`, `CustomFieldRequiredLabel`.
- **People:** a person is `UserAvatar` (two initials) everywhere, the account menu included. List chips are `UserChip`
  (avatar + name) for owners and assignees alike. Nobody is the dashed placeholder avatar, labelled by role with
  `OWNER_LABELS` ("No owner") or `ASSIGNEE_LABELS` ("Unassigned"), in chips, pickers, filters and forms. Person
  pickers build their options with `createUserOptions`, and form fields use `UserSelect`.
- **Dates:** list chips use the short format (`formatShortDate`, "Feb 1"); everything else uses the full format,
  `formatDate` for date-only values ("Feb 1, 2026", with `timeZone: "UTC"`) and `formatDateTime` for timestamps,
  never relative times. Dates are edited in a calendar popover (`PropertyDate`, or `DateField` in forms), never in
  the browser's locale-dependent `<input type="date">`.
- **Ordering:** an enumeration appears in one order wherever it's listed: pickers, filters, forms, detail pages and
  dashboard charts. Severity follows `SEVERITY_ORDER` (most severe first), finding status `STATUS_ORDER`, and role
  permissions `PERMISSION_RESOURCE_ORDER` / `PERMISSION_VERB_ORDER` (`features/roles/lib/role.ts`). Never list API keys
  in `Object.entries` order. A label/value pair, such as a select option, shows the label first.
- **Building blocks:** lists use `src/components/data-list/` rows with property chips; detail pages use
  `src/components/properties-panel/` (`DetailLayout`, `DetailSection`, `PropertiesPanel`, `PropertySelect`); row clicks
  open `DetailPeek`; edit forms and the import form sit in `PageColumn`.
- **Detail sections:** key/value content is `DetailFields` of `DetailField`s, whose key column and value inset match
  `PropertyRow`, so values line up with the properties panel. Related records are a `DetailList` of plain
  `DetailListItem` rows; trays are for list fields in forms only. Row actions sit in the row's `actions` slot
  (`RowActions`), which fades them in on hover or focus: icon buttons for up to two actions, a "⋯" menu for more. A
  section's add button is hidden when nothing can be added, and the empty state says why.
- **Record actions:** every entity offers its actions in the same places. A detail page's header holds only a "⋯" menu
  (`usePageMeta({ menu })`), and the peek header shows the same menu (`DetailPeek`'s `menu`), both built from the
  feature's `use<X>RecordActions` hook: the edit item first, then destructive items such as "Delete X…" last behind a
  separator (`RecordMenuItems`). Items that open a dialog or confirmation end in "…"; items that navigate don't. An
  action that doesn't apply stays in the menu disabled, as on built-in roles, rather than leaving the header empty. The
  primary header button is reserved for create on list pages. Every `DataList` with `onRowDelete` or `bulkActions` gets
  selection and the same row context menu: Open, Open in new tab, then the bulk actions and "Delete", all with icons.
  Single and bulk deletes share one `useDeleteX` hook, with one confirm dialog, which leaves the deleted record's page
  or peek (`useLeaveDeletedRecords`). Users are disabled, never deleted, and nobody can disable their own account.
- **Create flows:** every resource is created in a modal, never on a `/new` page. A feature's
  `components/create-<x>-dialog.tsx` wraps its form in `FormDialog` (`src/components/form-dialog.tsx`), runs the
  lifecycle create through `useFormDialogSubmit` so a failed create keeps the draft, and resolves to the created record.
  Its `hooks/use-create-<x>.ts` opens it and navigates to the new record's detail page. Forms put their buttons in
  `FormActions`, which pins them to the dialog's bottom edge and renders inline on edit pages. Mount the dialog's
  `.Root` in `src/routes/_authenticated.tsx`. Every other form dialog, such as the finding details, observation and
  identifier dialogs, uses `FormDialog` and `FormActions` too; only `ConfirmDialog` doesn't. `FormDialog` has two
  sizes: `default` for single-column forms and `wide` for forms with two-column field rows.
- **Forms:** inputs, textareas, select triggers and comboboxes share `text-sm` and a `ChevronDown`; a combobox trigger
  is a `Button variant="field"`. Controls in popovers and property rows use `SelectTrigger size="sm"`, which matches
  their `text-13` labels. A form section is a `FieldSet` with a `FieldLegend` after a `FieldSeparator`; a field that
  holds a list (role permissions, select options, asset identifiers) is a `FieldSet` with a
  `FieldLegend variant="label"` over a `bg-muted` tray of white rows and a ghost add button.

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
  resets after each test. The setup also unmounts rendered components, and the Vitest config clears `vi.fn()` calls,
  restores `vi.spyOn()` spies and unstubs env vars before each test, so don't repeat `cleanup()`, `mockReset()` or
  `vi.restoreAllMocks()` in test files. Shared jsdom polyfills live in `src/test/dom-polyfills.ts`.
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
- Passing tests print nothing, and any `console.error` or `console.warn` a test didn't declare fails it (React's `act(...)`
  and "Maximum update depth" warnings included). `mockApiError` also declares the app's error log for that failure as
  expected; declare other expected errors or warnings with `expectConsoleLog(text | matcher)` from `@/test/console.ts`,
  matching the message or error, never everything. Do not spy on `console` yourself: to assert on a log, read
  `vi.mocked(console.error)`. Unavoidable third-party warnings go in its `IGNORED_WARNINGS`, with a reason. The render helpers cancel their queries when a test ends, so no
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
