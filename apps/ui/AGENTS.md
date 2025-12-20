# Cortex UI Codebase Guide

## Commands

- **Install**: `pnpm install`
- **Dev**: `pnpm dev`
- **Build**: `pnpm build` (runs `vite build` + `tsc`)

## Code Style & Conventions

- **Framework**: React 19 + Vite + TypeScript.
- **Routing**: @tanstack/react-router (File-based routing in `src/routes`).
- **State**: @tanstack/react-query for async data.
- **Styling**: Tailwind CSS. Use `cn()` helper from `@/lib/utils` to merge classes.
- **UI Components**: shadcn UI primitives located in `src/components/ui`.
- **Imports**: ALWAYS use absolute imports with `@/` alias (e.g., `import { Button } from "@/components/ui/button"`).
- **Naming**: kebab-case for components (`my-button.tsx`), camelCase for helpers (`utils.ts`).
