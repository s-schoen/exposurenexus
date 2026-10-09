import { setupServer } from "msw/node";

import { createMockDb } from "@/mocks/db.ts";
import { createHandlers } from "@/mocks/handlers/index.ts";

/** Shared by every test file; `src/test/setup.ts` resets it after each test. */
export const db = createMockDb();

export const server = setupServer(...createHandlers(db));
