# OpenVLP Web User Interface

## Commands

- Use `pnpm`, NEVER use `npm` or `yarn`
- `pnpm build` to build code with `tsc` and check for syntax errors
- `pnpm check` to lint code with `eslint`
- `pnpm test` to run the full Vitest suite
- `pnpm test:coverage` to run the test suite with coverage output
- `pnpm storybook` to run Storybook locally
- `pnpm build-storybook` to build the static Storybook site

## Code Style & Conventions

Do NOT commit any changes to git unless you are explicitly asked.

- **Framework**: React 19 + Vite + TypeScript.
- **Routing**: @tanstack/react-router (File-based routing in `src/routes`).
- **State**: @tanstack/react-query for async data.
- **Styling**: ShadCN components with Tailwind CSS. Use `cn()` helper from `@/lib/utils` to merge classes.
- **UI Components**: shadcn UI primitives located in `src/components/ui`.
- **Imports**: ALWAYS use absolute imports with `@/` alias (e.g., `import { Button } from "@/components/ui/button"`).
- **Naming**: kebab-case for components (`my-button.tsx`), camelCase for helpers (`utils.ts`).
- **Storybook**: Always create or update a Storybook story for new app-owned components. Prefer colocated
  `*.stories.tsx` files that cover the component's primary visual states. Do not add stories for shadcn internal
  primitives in `src/components/ui` unless explicitly requested.

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
- If a component needs browser APIs that jsdom does not provide, add the smallest possible test-local polyfill in the
  test file.
- Validate new component work with `pnpm check` and `pnpm test`. Use `pnpm test:coverage` when you need a coverage
  report.
