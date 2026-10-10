import * as matchers from "@testing-library/jest-dom/matchers";
import { configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect } from "vitest";

import { resetFixtureSequences } from "@/mocks/fixtures/ids.ts";
import { db, server } from "@/mocks/node.ts";
import "@/test/dom-polyfills.ts";

expect.extend(matchers);

// Whole-app renders chain several mock API requests; give findBy*/waitFor room under a busy,
// parallel suite.
configure({ asyncUtilTimeout: 3000 });

// Every API request goes to the mock handlers; an unmocked request fails the test.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  db.reset();
  resetFixtureSequences();
});
afterAll(() => server.close());
