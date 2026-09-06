import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOGIN_REDIRECT,
  createRouterLoginRedirects,
} from "@/features/auth/routing/login-redirect.ts";
import { routeTree } from "@/routeTree.gen.ts";

function createRedirects() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/"],
    }),
    context: {
      auth: undefined!,
      page: undefined!,
      redirects: undefined!,
      queryClient: new QueryClient(),
    },
  });

  return createRouterLoginRedirects(router, {
    origin: "https://app.example",
  });
}

describe("login redirects", () => {
  it("keeps known internal route redirects with query strings and hashes", () => {
    const redirects = createRedirects();

    expect(redirects.safeLoginRedirect("/findings/triage?status=active#row-1")).toBe(
      "/findings/triage?status=active#row-1",
    );
    expect(redirects.safeLoginRedirect("/assets/some-id")).toBe("/assets/some-id");
    expect(
      redirects.safeLoginRedirect("https://app.example/assets/some-id?tab=details#activity"),
    ).toBe("/assets/some-id?tab=details#activity");
  });

  it("falls back for unknown, login, external, and malformed redirects", () => {
    const redirects = createRedirects();

    expect(redirects.safeLoginRedirect(undefined)).toBe(DEFAULT_LOGIN_REDIRECT);
    expect(redirects.safeLoginRedirect("")).toBe(DEFAULT_LOGIN_REDIRECT);
    expect(redirects.safeLoginRedirect("/future-route")).toBe(DEFAULT_LOGIN_REDIRECT);
    expect(redirects.safeLoginRedirect("/login")).toBe(DEFAULT_LOGIN_REDIRECT);
    expect(redirects.safeLoginRedirect("/login?redirect=/assets")).toBe(DEFAULT_LOGIN_REDIRECT);
    expect(redirects.safeLoginRedirect("https://example.com")).toBe(DEFAULT_LOGIN_REDIRECT);
    expect(redirects.safeLoginRedirect("//example.com")).toBe(DEFAULT_LOGIN_REDIRECT);
    expect(redirects.safeLoginRedirect("javascript:alert(1)")).toBe(DEFAULT_LOGIN_REDIRECT);
  });
});
