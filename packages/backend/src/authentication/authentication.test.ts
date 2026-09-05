import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthenticationBehavior } from "./authentication.js";

import type { ApplicationError } from "../application-error.js";
import type { Logger } from "pino";

const { verifyPasswordHashMock } = vi.hoisted(() => ({
  verifyPasswordHashMock: vi.fn(),
}));

vi.mock("../identity/password.js", () => ({
  verifyPasswordHash: verifyPasswordHashMock,
}));

describe("authentication behavior", () => {
  const userProfileReader = {
    getByID: vi.fn(),
    getByUsername: vi.fn(),
  };
  const sessionPersistence = {
    getBySessionDigest: vi.fn(),
    create: vi.fn(),
    deleteBySessionDigest: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
  const enabledProfile = {
    id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    passwordHash: "argon2-password-hash",
    roleIds: [],
  };
  const publicEnabledProfile = {
    id: enabledProfile.id,
    username: enabledProfile.username,
    displayName: enabledProfile.displayName,
    email: enabledProfile.email,
    enabled: enabledProfile.enabled,
    roleIds: enabledProfile.roleIds,
  };
  const sessionHmacSecret = "012345678901234567890123456789012345678901234567890123456789";
  const sessionLifetimeHours = 12;
  const storedSession = {
    id: "48f2e3a5-4560-4a47-85b6-137106940bbb",
    sessionId: "stored-session-id-digest",
    userId: enabledProfile.id,
    sourceIp: "203.0.113.10",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2026-04-26T08:00:00.000Z"),
    expiresAt: new Date("2026-04-26T20:00:00.000Z"),
  };
  const publicSession = {
    id: storedSession.id,
    userId: storedSession.userId,
    sourceIp: storedSession.sourceIp,
    userAgent: storedSession.userAgent,
    createdAt: storedSession.createdAt,
    expiresAt: storedSession.expiresAt,
  };

  function createAuthentication() {
    return createAuthenticationBehavior({
      userProfileReader,
      sessionPersistence,
      sessionLifetimeHours,
      sessionHmacSecret,
      logger,
    });
  }

  function hmacSessionToken(sessionToken: string): string {
    return createHmac("sha256", sessionHmacSecret).update(sessionToken).digest("base64url");
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    verifyPasswordHashMock.mockResolvedValue(false);
  });

  it("creates sessions with an opaque token and exposes no persisted digest", async () => {
    const authentication = createAuthentication();
    const now = new Date("2026-04-26T08:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);
    userProfileReader.getByID.mockResolvedValue(enabledProfile);
    sessionPersistence.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session,
    }));

    const outcome = await authentication.createSession({
      userId: enabledProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
    });

    expect(outcome.sessionToken).toEqual(expect.any(String));
    expect(outcome.session).toEqual({
      id: storedSession.id,
      userId: enabledProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000),
    });
    expect(outcome.session).not.toHaveProperty("sessionId");
    expect(outcome.user).toEqual(publicEnabledProfile);
    expect(sessionPersistence.create).toHaveBeenCalledWith({
      sessionId: hmacSessionToken(outcome.sessionToken),
      userId: enabledProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000),
    });
  });

  it("creates sessions with null source metadata when omitted", async () => {
    const authentication = createAuthentication();
    const now = new Date("2026-04-26T08:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);
    userProfileReader.getByID.mockResolvedValue(enabledProfile);
    sessionPersistence.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session,
    }));

    const outcome = await authentication.createSession({ userId: enabledProfile.id });

    expect(sessionPersistence.create).toHaveBeenCalledWith({
      sessionId: hmacSessionToken(outcome.sessionToken),
      userId: enabledProfile.id,
      sourceIp: null,
      userAgent: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000),
    });
  });

  it("creates a session for valid credentials after persistence succeeds", async () => {
    const authentication = createAuthentication();
    const now = new Date("2026-04-26T08:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);
    userProfileReader.getByUsername.mockResolvedValue(enabledProfile);
    verifyPasswordHashMock.mockResolvedValue(true);
    sessionPersistence.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session,
    }));

    const outcome = await authentication.createSessionForCredentials({
      username: enabledProfile.username,
      password: "correct-horse-battery-staple",
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
    });

    expect(outcome).toMatchObject({
      authenticated: true,
      sessionToken: expect.any(String),
      session: publicSession,
      user: publicEnabledProfile,
    });
    expect(verifyPasswordHashMock).toHaveBeenCalledOnce();
    expect(userProfileReader.getByID).not.toHaveBeenCalled();
  });

  it("rejects invalid credentials without creating a session", async () => {
    const authentication = createAuthentication();

    userProfileReader.getByUsername.mockResolvedValue(enabledProfile);
    verifyPasswordHashMock.mockResolvedValue(false);

    await expect(
      authentication.createSessionForCredentials({
        username: enabledProfile.username,
        password: "wrong-password",
      }),
    ).resolves.toEqual({ authenticated: false, reason: "invalid-credentials" });
    expect(sessionPersistence.create).not.toHaveBeenCalled();
  });

  it("verifies a dummy hash for missing users", async () => {
    const authentication = createAuthentication();

    userProfileReader.getByUsername.mockResolvedValue(null);

    await expect(
      authentication.createSessionForCredentials({
        username: "missing-user",
        password: "wrong-password",
      }),
    ).resolves.toEqual({ authenticated: false, reason: "invalid-credentials" });
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "wrong-password",
      expect.stringMatching(
        /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
      ),
    );
    expect(sessionPersistence.create).not.toHaveBeenCalled();
  });

  it("rejects disabled users after verifying their stored hash", async () => {
    const authentication = createAuthentication();
    const disabledProfile = { ...enabledProfile, enabled: false };

    userProfileReader.getByUsername.mockResolvedValue(disabledProfile);
    verifyPasswordHashMock.mockResolvedValue(true);

    await expect(
      authentication.createSessionForCredentials({
        username: disabledProfile.username,
        password: "correct-horse-battery-staple",
      }),
    ).resolves.toEqual({ authenticated: false, reason: "invalid-credentials" });
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "correct-horse-battery-staple",
      disabledProfile.passwordHash,
    );
    expect(sessionPersistence.create).not.toHaveBeenCalled();
  });

  it("maps credential lookup and persistence failures to the existing application error", async () => {
    const authentication = createAuthentication();
    const lookupError = new Error("db offline");

    userProfileReader.getByUsername.mockRejectedValueOnce(lookupError);

    await expect(
      authentication.createSessionForCredentials({
        username: enabledProfile.username,
        password: "correct-horse-battery-staple",
      }),
    ).rejects.toMatchObject({
      code: "auth.credentials_session_create_failed",
      kind: "unexpected",
      details: { username: enabledProfile.username },
    } satisfies Partial<ApplicationError>);
    expect(logger.error).toHaveBeenCalledWith(
      lookupError,
      "failed to create session for credentials",
    );

    userProfileReader.getByUsername.mockResolvedValue(enabledProfile);
    verifyPasswordHashMock.mockResolvedValue(true);
    sessionPersistence.create.mockRejectedValueOnce(new Error("write failed"));

    await expect(
      authentication.createSessionForCredentials({
        username: enabledProfile.username,
        password: "correct-horse-battery-staple",
      }),
    ).rejects.toMatchObject({ code: "auth.credentials_session_create_failed" });
  });

  it("maps direct session creation failures to the existing application error", async () => {
    const authentication = createAuthentication();

    sessionPersistence.create.mockRejectedValue(new Error("db offline"));

    await expect(authentication.createSession({ userId: enabledProfile.id })).rejects.toMatchObject(
      {
        code: "auth.session_create_failed",
        kind: "unexpected",
        details: { userId: enabledProfile.id },
      } satisfies Partial<ApplicationError>,
    );
  });

  it("validates active sessions and exposes no persisted digest", async () => {
    const authentication = createAuthentication();
    const sessionToken = "public-session-token";

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"));
    sessionPersistence.getBySessionDigest.mockResolvedValue(storedSession);
    userProfileReader.getByID.mockResolvedValue(enabledProfile);

    await expect(authentication.validateSession({ sessionToken })).resolves.toEqual({
      valid: true,
      session: publicSession,
      user: publicEnabledProfile,
    });
    expect(sessionPersistence.getBySessionDigest).toHaveBeenCalledWith(
      hmacSessionToken(sessionToken),
    );
  });

  it.each([
    {
      name: "missing session",
      session: null,
      user: enabledProfile,
      reason: "invalid-session",
      loadsUser: false,
    },
    {
      name: "expired session",
      session: { ...storedSession, expiresAt: new Date("2026-04-26T07:59:59.000Z") },
      user: enabledProfile,
      reason: "session-expired",
      loadsUser: false,
    },
    {
      name: "deleted user",
      session: storedSession,
      user: null,
      reason: "unknown-user",
      loadsUser: true,
    },
    {
      name: "disabled user",
      session: storedSession,
      user: { ...enabledProfile, enabled: false },
      reason: "disabled-user",
      loadsUser: true,
    },
  ])("rejects a $name", async ({ session, user, reason, loadsUser }) => {
    const authentication = createAuthentication();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"));
    sessionPersistence.getBySessionDigest.mockResolvedValue(session);
    userProfileReader.getByID.mockResolvedValue(user);

    await expect(
      authentication.validateSession({ sessionToken: "public-session-token" }),
    ).resolves.toEqual({ valid: false, reason });
    if (loadsUser) {
      expect(userProfileReader.getByID).toHaveBeenCalledWith(storedSession.userId);
    } else {
      expect(userProfileReader.getByID).not.toHaveBeenCalled();
    }
  });

  it("maps validation lookup failures to the existing application error", async () => {
    const authentication = createAuthentication();

    sessionPersistence.getBySessionDigest.mockRejectedValue(new Error("db offline"));

    await expect(
      authentication.validateSession({ sessionToken: "public-session-token" }),
    ).rejects.toMatchObject({
      code: "auth.session_validate_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });

  it("revokes sessions by deleting their stored HMAC digest", async () => {
    const authentication = createAuthentication();
    const sessionToken = "public-session-token";

    sessionPersistence.deleteBySessionDigest.mockResolvedValue(storedSession);

    await expect(authentication.revokeSession({ sessionToken })).resolves.toEqual({
      revoked: true,
      session: publicSession,
    });
    expect(sessionPersistence.deleteBySessionDigest).toHaveBeenCalledWith(
      hmacSessionToken(sessionToken),
    );
  });

  it("returns a neutral outcome when revoking a missing session", async () => {
    const authentication = createAuthentication();

    sessionPersistence.deleteBySessionDigest.mockResolvedValue(null);

    await expect(
      authentication.revokeSession({ sessionToken: "missing-session-token" }),
    ).resolves.toEqual({ revoked: false });
  });

  it("maps session revocation failures to the existing application error", async () => {
    const authentication = createAuthentication();

    sessionPersistence.deleteBySessionDigest.mockRejectedValue(new Error("db offline"));

    await expect(
      authentication.revokeSession({ sessionToken: "public-session-token" }),
    ).rejects.toMatchObject({
      code: "auth.session_revoke_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });
});
