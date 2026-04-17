# OpenVLP Web User Interface

## Commands

- Use `pnpm`, NEVER use `npm` or `yarn`
- `pnpm build` to build code with `tsc` and check for syntax errors
- `pnpm check` to lint code with `eslint`

## Code Style & Conventions

Do NOT commit any changes to git unless you are explicitly asked.

- **Framework**: React 19 + Vite + TypeScript.
- **Routing**: @tanstack/react-router (File-based routing in `src/routes`).
- **State**: @tanstack/react-query for async data.
- **Styling**: ShadCN components with Tailwind CSS. Use `cn()` helper from `@/lib/utils` to merge classes.
- **UI Components**: shadcn UI primitives located in `src/components/ui`.
- **Imports**: ALWAYS use absolute imports with `@/` alias (e.g., `import { Button } from "@/components/ui/button"`).
- **Naming**: kebab-case for components (`my-button.tsx`), camelCase for helpers (`utils.ts`).
- **Storybook**: Always create or update a Storybook story for new app-owned components. Prefer colocated `*.stories.tsx` files that cover the component's primary visual states. Do not add stories for shadcn internal primitives in `src/components/ui` unless explicitly requested.
