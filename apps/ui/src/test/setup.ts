import * as matchers from "@testing-library/jest-dom/matchers";
import { afterAll, afterEach, beforeAll, expect } from "vitest";

import { resetFixtureSequences } from "@/mocks/fixtures/ids.ts";
import { db, server } from "@/mocks/node.ts";

expect.extend(matchers);

// Every API request goes to the mock handlers; an unmocked request fails the test.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  db.reset();
  resetFixtureSequences();
});
afterAll(() => server.close());
