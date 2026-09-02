import { describe, expect, it, vi } from "vitest";

import { createUserSessionExpiredRedirectHandler } from "@/features/auth/routing/session-expiry.ts";

describe("auth session expiry handling", () => {
  it("deduplicates redirects from parallel session-expired events", async () => {
    let resolveNavigate: () => void = () => undefined;
    const navigatePromise = new Promise<void>((resolve) => {
      resolveNavigate = resolve;
    });
    const location = {
      href: "/findings/triage?status=active",
      pathname: "/findings/triage",
    };
    const clearSession = vi.fn();
    const navigateToLogin = vi.fn(() => navigatePromise);
    const safeLoginRedirect = vi.fn((redirect: unknown) => String(redirect));
    const handler = createUserSessionExpiredRedirectHandler({
      clearSession,
      getLocation: () => location,
      navigateToLogin,
      safeLoginRedirect,
    });

    handler({ source: "query" });
    handler({ source: "mutation" });

    expect(clearSession).toHaveBeenCalledTimes(2);
    expect(safeLoginRedirect).toHaveBeenCalledTimes(1);
    expect(safeLoginRedirect).toHaveBeenCalledWith("/findings/triage?status=active");
    expect(navigateToLogin).toHaveBeenCalledTimes(1);
    expect(navigateToLogin).toHaveBeenCalledWith("/findings/triage?status=active");

    location.href = "/login?redirect=/findings/triage";
    location.pathname = "/login";
    resolveNavigate();
    await navigatePromise;

    handler({ source: "query" });

    expect(navigateToLogin).toHaveBeenCalledTimes(1);
  });
});
