import { http } from "msw";
import { onTestFinished } from "vitest";

import { apiPath } from "@/mocks/handlers/shared.ts";
import { db, server } from "@/mocks/node.ts";
import { replyError } from "@/mocks/reply.ts";

import type { MockScenario } from "@/mocks/db.ts";

export { db, server };

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * Makes one endpoint fail for the rest of the test, e.g.
 * `mockApiError("get", "/roles", 500)`. `path` is relative to `/api` and may use `:params`.
 */
export function mockApiError(
  method: HttpMethod,
  path: string,
  status: number,
  error = "Mock API error",
  reason?: string,
): void {
  server.use(http[method](apiPath(path), () => replyError(status, error, reason)));
}

/** Replaces the mock data with another seed for the rest of the test. */
export function seedScenario(scenario: MockScenario): void {
  db.reset(scenario);
}

/** Collects `"GET /api/roles"`-style entries for every API request made during the current test. */
export function recordApiRequests(): Array<string> {
  const requests: Array<string> = [];
  const listener = ({ request }: { request: Request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  };
  server.events.on("request:start", listener);
  onTestFinished(() => server.events.removeListener("request:start", listener));
  return requests;
}
