# OpenVLP Web User Interface

## Commands

* Use `pnpm`, NEVER use `npm` or `yarn`
* `pnpm build` to build code with `tsc` and check for syntax errors
* `pnpm lint` to lint code with `eslint`

## Code Style & Conventions

- **Framework**: React 19 + Vite + TypeScript.
- **Routing**: @tanstack/react-router (File-based routing in `src/routes`).
- **State**: @tanstack/react-query for async data.
- **Styling**: ShadCN components with Tailwind CSS. Use `cn()` helper from `@/lib/utils` to merge classes.
- **UI Components**: shadcn UI primitives located in `src/components/ui`.
- **Imports**: ALWAYS use absolute imports with `@/` alias (e.g., `import { Button } from "@/components/ui/button"`).
- **Naming**: kebab-case for components (`my-button.tsx`), camelCase for helpers (`utils.ts`).
