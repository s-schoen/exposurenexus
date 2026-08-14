import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_SESSION_COOKIE } from "../middleware/auth.js";
import { ApplicationError } from "../service/application-error.js";
import { createTestApp, createTestUser } from "../test/app.js";
import { createAuthRoute } from "./auth.js";

describe("auth routes", () => {
  const sessionCookie = (sessionId: string) => `${AUTH_SESSION_COOKIE}=${sessionId}`;
  const user = createTestUser();
  const session = {
    id: "a2ca50c9-1e4d-4533-97bc-e060f58b6747",
    sessionId: "stored-session-id-digest",
    userId: user.id,
    sourceIp: "203.0.113.10",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2026-04-26T08:00:00.000Z"),
    expiresAt: new Date("2026-04-26T20:00:00.000Z"),
  };
  const authService = {
    createSessionForCredentials: vi.fn(),
    createSession: vi.fn(),
    validateSession: vi.fn(),
    revokeSession: vi.fn(),
    userHasPermission: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an opaque session cookie for valid credentials", async () => {
    authService.createSessionForCredentials.mockResolvedValue({
      sessionId: "public-session-token",
      session,
      user,
    });

    const app = createTestApp({
      authRoute: createAuthRoute(authService),
    });

    const response = await app.request("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        "X-Forwarded-For": "203.0.113.10, 198.51.100.1",
        "X-Request-Id": "auth-login-request",
      },
      body: JSON.stringify({
        username: "alice",
        password: "correct-horse-battery-staple",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(authService.createSessionForCredentials).toHaveBeenCalledWith({
      username: "alice",
      password: "correct-horse-battery-staple",
      sourceIp: "unknown",
      userAgent: "Mozilla/5.0",
      correlationId: "auth-login-request",
    });
    expect(response.headers.get("set-cookie")).toContain(sessionCookie("public-session-token"));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain("Domain=");
    expect(body).toEqual({
      correlationId: "auth-login-request",
      data: {
        user,
        session: {
          id: session.id,
          userId: session.userId,
          sourceIp: session.sourceIp,
          userAgent: session.userAgent,
          createdAt: "2026-04-26T08:00:00.000Z",
          expiresAt: "2026-04-26T20:00:00.000Z",
        },
      },
    });
  });

  it("rejects invalid credentials without creating a cookie", async () => {
    authService.createSessionForCredentials.mockResolvedValue(null);

    const app = createTestApp({
      authRoute: createAuthRoute(authService),
    });

    const response = await app.request("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "auth-invalid-login-request",
      },
      body: JSON.stringify({
        username: "alice",
        password: "wrong-password",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(authService.createSessionForCredentials).toHaveBeenCalledWith({
      username: "alice",
      password: "wrong-password",
      sourceIp: "unknown",
      userAgent: undefined,
      correlationId: "auth-invalid-login-request",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body).toEqual({
      correlationId: "auth-invalid-login-request",
      status: 401,
      error: "Unauthorized",
    });
  });

  it("does not expose auth service diagnostics for unexpected login failures", async () => {
    authService.createSessionForCredentials.mockRejectedValue(
      new ApplicationError({
        code: "auth.credentials_session_create_failed",
        kind: "unexpected",
        message: "failed to create session for credentials",
        details: { username: "alice" },
      }),
    );

    const app = createTestApp({
      authRoute: createAuthRoute(authService),
    });

    const response = await app.request("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "auth-unexpected-login-request",
      },
      body: JSON.stringify({
        username: "alice",
        password: "correct-horse-battery-staple",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body).toMatchObject({
      correlationId: "auth-unexpected-login-request",
      status: 500,
      error: expect.any(String),
    });
    expect(body.error).not.toContain("credentials");
    expect(body.error).not.toContain("alice");
    expect(body).not.toHaveProperty("reason");
  });

  it("returns the active session from the opaque session cookie", async () => {
    authService.validateSession.mockResolvedValue({
      session,
      user,
    });

    const app = createTestApp({
      authRoute: createAuthRoute(authService),
    });

    const response = await app.request("/api/auth/session", {
      headers: {
        cookie: sessionCookie("public-session-token"),
        "X-Request-Id": "auth-session-request",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(authService.validateSession).toHaveBeenCalledWith({
      sessionId: "public-session-token",
      correlationId: "auth-session-request",
    });
    expect(body).toEqual({
      correlationId: "auth-session-request",
      data: {
        user,
        session: {
          id: session.id,
          userId: session.userId,
          sourceIp: session.sourceIp,
          userAgent: session.userAgent,
          createdAt: "2026-04-26T08:00:00.000Z",
          expiresAt: "2026-04-26T20:00:00.000Z",
        },
      },
    });
  });

  it("clears the cookie when the active session is invalid", async () => {
    authService.validateSession.mockResolvedValue(null);

    const app = createTestApp({
      authRoute: createAuthRoute(authService),
    });

    const response = await app.request("/api/auth/session", {
      headers: {
        cookie: sessionCookie("invalid-session-token"),
        "X-Request-Id": "auth-invalid-session-request",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(authService.validateSession).toHaveBeenCalledWith({
      sessionId: "invalid-session-token",
      correlationId: "auth-invalid-session-request",
    });
    expect(response.headers.get("set-cookie")).toContain(sessionCookie(""));
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(body).toEqual({
      correlationId: "auth-invalid-session-request",
      status: 401,
      error: "Unauthorized",
    });
  });

  it("revokes the active session and clears the cookie", async () => {
    authService.revokeSession.mockResolvedValue(true);

    const app = createTestApp({
      authRoute: createAuthRoute(authService),
    });

    const response = await app.request("/api/auth", {
      method: "DELETE",
      headers: {
        cookie: sessionCookie("public-session-token"),
        "X-Request-Id": "auth-logout-request",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(authService.revokeSession).toHaveBeenCalledWith({
      sessionId: "public-session-token",
      correlationId: "auth-logout-request",
    });
    expect(response.headers.get("set-cookie")).toContain(sessionCookie(""));
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(body).toEqual({
      correlationId: "auth-logout-request",
      data: {
        revoked: true,
      },
    });
  });

  it("does not expose login and logout aliases", async () => {
    const app = createTestApp({
      authRoute: createAuthRoute(authService),
    });

    const loginResponse = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "alice",
        password: "correct-horse-battery-staple",
      }),
    });
    const logoutResponse = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: sessionCookie("public-session-token"),
      },
    });

    expect(loginResponse.status).toBe(404);
    expect(logoutResponse.status).toBe(404);
    expect(authService.createSessionForCredentials).not.toHaveBeenCalled();
    expect(authService.revokeSession).not.toHaveBeenCalled();
  });
});
