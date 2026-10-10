import { HttpResponse, http } from "msw";
import { onTestFinished } from "vitest";

import { APIError } from "@/lib/api-client.ts";
import { apiPath } from "@/mocks/handlers/shared.ts";
import { db, server } from "@/mocks/node.ts";
import { replyError } from "@/mocks/reply.ts";
import { expectConsoleLog } from "@/test/console.ts";

import type { MockScenario } from "@/mocks/db.ts";

export { db, server };

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * Makes one endpoint fail for the rest of the test, e.g.
 * `mockApiError("get", "/roles", 500)`. `path` is relative to `/api` and may use `:params`.
 * The app's error log for this failure (lifecycle hook or query cache) is expected.
 */
export function mockApiError(
  method: HttpMethod,
  path: string,
  status: number,
  error = "Mock API error",
  reason?: string,
): void {
  expectConsoleLog((args) =>
    args.some(
      (arg) => arg instanceof APIError && arg.statusCode === status && arg.message === error,
    ),
  );
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

export interface CapturedApiCall {
  url: URL;
  headers: Headers;
  /** Parsed JSON body, or `undefined` for requests without one. */
  body: unknown;
}

/**
 * Records requests to one endpoint while the mock API still answers them, for the few tests
 * that assert query strings, headers or bodies. Prefer asserting `db` state.
 */
export function captureApiCalls(method: HttpMethod, path: string): Array<CapturedApiCall> {
  const calls: Array<CapturedApiCall> = [];
  server.use(
    http[method](apiPath(path), async ({ request }) => {
      const text = await request.clone().text();
      calls.push({
        url: new URL(request.url),
        headers: request.headers,
        body: text ? (JSON.parse(text) as unknown) : undefined,
      });
      return undefined;
    }),
  );
  return calls;
}

/**
 * Holds every response from one endpoint until `release()`, to observe pending states. Held
 * requests then get the mock API's normal answer.
 */
export function holdApiResponses(method: HttpMethod, path: string): { release: () => void } {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http[method](apiPath(path), async () => {
      await held;
      return undefined;
    }),
  );
  onTestFinished(release);
  return { release };
}

/** Answers one endpoint with a raw JSON body, e.g. a malformed envelope. */
export function mockApiReply(method: HttpMethod, path: string, body: unknown, status = 200): void {
  server.use(http[method](apiPath(path), () => HttpResponse.json(body as object, { status })));
}
