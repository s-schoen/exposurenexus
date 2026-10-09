import { setupWorker } from "msw/browser";

import { createMockDb, isMockScenario } from "@/mocks/db.ts";
import { createHandlers } from "@/mocks/handlers/index.ts";

/**
 * Starts the mock API for `pnpm dev:mock`. Pick a seed with `?mockScenario=empty|loggedOut`.
 * Data lives in memory, so a reload starts over.
 */
export async function startMocking(): Promise<void> {
  const requested = new URLSearchParams(window.location.search).get("mockScenario");
  const db = createMockDb(isMockScenario(requested) ? requested : "default");
  const worker = setupWorker(...createHandlers(db));

  await worker.start({ onUnhandledFrame: "bypass" });
}
