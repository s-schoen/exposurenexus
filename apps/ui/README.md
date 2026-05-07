# ExposureNexus UI

React and Vite frontend for ExposureNexus.

See [Development](../../docs/development.md) for local setup and workspace commands.

## Commands

```bash
pnpm dev
pnpm build
pnpm check
pnpm test
pnpm test:coverage
pnpm storybook
pnpm build-storybook
```

## Notes

- Routing uses TanStack Router file-based routes in `src/routes`.
- Server state uses TanStack Query.
- App-owned components live under `src/components`.
- Shared API/domain types come from `@exposurenexus/types`.
