import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App, createAppRouter } from "@/app.tsx";
import { createTestQueryClient } from "@/test/harness.tsx";
import { seedScenario } from "@/test/msw.ts";

import type { MockScenario } from "@/mocks/db.ts";

interface RenderAppOptions {
  /** Initial URL, e.g. `/roles?selected=…`. */
  path?: string;
  /** Mock data seed; tests start from `default` (signed in as the seeded admin). */
  scenario?: MockScenario;
}

/**
 * Renders the whole app (real router, queries and providers) against the MSW mock API.
 * Use it for page-level tests; wait for content with `findBy*`.
 */
export function renderApp({ path = "/", scenario }: RenderAppOptions = {}) {
  if (scenario) {
    seedScenario(scenario);
  }

  const queryClient = createTestQueryClient();
  const router = createAppRouter({
    queryClient,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <App router={router} />
    </QueryClientProvider>,
  );

  return { user: userEvent.setup(), router, queryClient, ...view };
}
