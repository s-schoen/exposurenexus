import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Logger } from "pino";

const { verifyPasswordHashMock } = vi.hoisted(() => ({
  verifyPasswordHashMock: vi.fn(),
}));

vi.mock("../lib/argon2.js", () => ({
  verifyPasswordHash: verifyPasswordHashMock,
}));

import { serializeDomainEventForLog } from "../event-handler/log-event.js";
import { createDomainEventCollector } from "../test/eventbus.js";
import { createAuthService } from "./auth.js";

import type { ApplicationError } from "@exposurenexus/backend";

describe("auth service", () => {
  const userProfileRepository = {
    getByID: vi.fn(),
    getByUsername: vi.fn(),
  };
  const userSessionRepository = {
    getBySessionID: vi.fn(),
    create: vi.fn(),
    deleteBySessionID: vi.fn(),
  };
  const domainEvents = createDomainEventCollector();
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

  function createService() {
    return createAuthService({
      userProfileRepository,
      userSessionRepository,
      domainEventEmitter: domainEvents.emitter,
      sessionLifetimeHours,
      sessionHmacSecret,
      logger,
    });
  }

  function hmacSessionId(sessionId: string): string {
    return createHmac("sha256", sessionHmacSecret).update(sessionId).digest("base64url");
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    domainEvents.clear();
    verifyPasswordHashMock.mockResolvedValue(false);
  });

  it("creates sessions with an opaque token and stores only an HMAC digest", async () => {
    const service = createService();
    const now = new Date("2026-04-26T08:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);
    userProfileRepository.getByID.mockResolvedValue(enabledProfile);
    userSessionRepository.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session,
    }));

    const result = await service.createSession({
      userId: enabledProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      correlationId: "auth-create-session-request",
    });

    expect(result.sessionId).toEqual(expect.any(String));
    expect(result.sessionId).not.toBe(result.session.sessionId);
    expect(result.user).toEqual(publicEnabledProfile);
    expect(userSessionRepository.create).toHaveBeenCalledWith({
      sessionId: hmacSessionId(result.sessionId),
      userId: enabledProfile.id,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000),
    });
    expect(domainEvents.subjects()).toEqual(["auth.session.created"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.session.created",
      source: "auth",
      correlationId: "auth-create-session-request",
      data: {
        user: publicEnabledProfile,
        session: result.session,
      },
    });
    const createdSessionEvent = domainEvents.eventsFor("auth.session.created")[0]!;
    expect(createdSessionEvent.data.user).not.toHaveProperty("passwordHash");
    expect(serializeDomainEventForLog(createdSessionEvent).data).not.toHaveProperty(
      "user.passwordHash",
    );
  });

  it("creates sessions with null source metadata when omitted", async () => {
    const service = createService();
    const now = new Date("2026-04-26T08:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);
    userProfileRepository.getByID.mockResolvedValue(enabledProfile);
    userSessionRepository.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session,
    }));

    const result = await service.createSession({
      userId: enabledProfile.id,
    });

    expect(userSessionRepository.create).toHaveBeenCalledWith({
      sessionId: hmacSessionId(result.sessionId),
      userId: enabledProfile.id,
      sourceIp: null,
      userAgent: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000),
    });
    expect(domainEvents.events[0]).not.toHaveProperty("correlationId");
  });

  it("creates a session for valid credentials without verifying the password twice", async () => {
    const service = createService();
    const now = new Date("2026-04-26T08:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);
    userProfileRepository.getByUsername.mockResolvedValue(enabledProfile);
    verifyPasswordHashMock.mockResolvedValue(true);
    userSessionRepository.create.mockImplementation(async (session) => ({
      id: storedSession.id,
      ...session,
    }));

    const result = await service.createSessionForCredentials({
      username: enabledProfile.username,
      password: "correct-horse-battery-staple",
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      correlationId: "auth-credentials-request",
    });

    expect(result).toEqual({
      sessionId: expect.any(String),
      session: {
        id: storedSession.id,
        sessionId: hmacSessionId(result!.sessionId),
        userId: enabledProfile.id,
        sourceIp: "203.0.113.10",
        userAgent: "Mozilla/5.0",
        createdAt: now,
        expiresAt: new Date(now.getTime() + sessionLifetimeHours * 60 * 60 * 1000),
      },
      user: publicEnabledProfile,
    });
    expect(verifyPasswordHashMock).toHaveBeenCalledOnce();
    expect(domainEvents.subjects()).toEqual(["auth.success", "auth.session.created"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.success",
      source: "auth",
      correlationId: "auth-credentials-request",
      data: {
        user: publicEnabledProfile,
      },
    });
    expect(domainEvents.events[1]).toMatchObject({
      subject: "auth.session.created",
      source: "auth",
      correlationId: "auth-credentials-request",
      data: {
        user: publicEnabledProfile,
        session: result!.session,
      },
    });
    const successEvent = domainEvents.eventsFor("auth.success")[0]!;
    const createdSessionEvent = domainEvents.eventsFor("auth.session.created")[0]!;
    expect(successEvent.data.user).not.toHaveProperty("passwordHash");
    expect(createdSessionEvent.data.user).not.toHaveProperty("passwordHash");
    expect(serializeDomainEventForLog(successEvent).data).not.toHaveProperty("user.passwordHash");
    expect(serializeDomainEventForLog(createdSessionEvent).data).not.toHaveProperty(
      "user.passwordHash",
    );
  });

  it("does not create a session for invalid credentials", async () => {
    const service = createService();

    userProfileRepository.getByUsername.mockResolvedValue(enabledProfile);
    verifyPasswordHashMock.mockResolvedValue(false);

    await expect(
      service.createSessionForCredentials({
        username: enabledProfile.username,
        password: "wrong-password",
        correlationId: "auth-invalid-credentials-request",
      }),
    ).resolves.toBeNull();
    expect(userSessionRepository.create).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual(["auth.failure"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.failure",
      source: "auth",
      correlationId: "auth-invalid-credentials-request",
      data: {
        username: enabledProfile.username,
        reason: "invalid-credentials",
      },
    });
  });

  it("does not create a session for a missing username after verifying a dummy hash", async () => {
    const service = createService();

    userProfileRepository.getByUsername.mockResolvedValue(null);

    await expect(
      service.createSessionForCredentials({
        username: "missing-user",
        password: "wrong-password",
      }),
    ).resolves.toBeNull();
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "wrong-password",
      expect.stringMatching(
        /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
      ),
    );
    expect(userSessionRepository.create).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual(["auth.failure"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.failure",
      source: "auth",
      data: {
        username: "missing-user",
        reason: "invalid-credentials",
      },
    });
  });

  it("does not create a session for disabled users after verifying the stored hash", async () => {
    const service = createService();
    const disabledProfile = {
      ...enabledProfile,
      enabled: false,
    };

    userProfileRepository.getByUsername.mockResolvedValue(disabledProfile);
    verifyPasswordHashMock.mockResolvedValue(true);

    await expect(
      service.createSessionForCredentials({
        username: disabledProfile.username,
        password: "correct-horse-battery-staple",
      }),
    ).resolves.toBeNull();
    expect(verifyPasswordHashMock).toHaveBeenCalledWith(
      "correct-horse-battery-staple",
      disabledProfile.passwordHash,
    );
    expect(userSessionRepository.create).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual(["auth.failure"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.failure",
      source: "auth",
      data: {
        username: disabledProfile.username,
        reason: "invalid-credentials",
      },
    });
  });

  it("maps credential lookup failures to an unexpected ApplicationError", async () => {
    const service = createService();
    const error = new Error("db offline");

    userProfileRepository.getByUsername.mockRejectedValue(error);

    await expect(
      service.createSessionForCredentials({
        username: enabledProfile.username,
        password: "correct-horse-battery-staple",
      }),
    ).rejects.toMatchObject({
      code: "auth.credentials_session_create_failed",
      kind: "unexpected",
      details: { username: enabledProfile.username },
    } satisfies Partial<ApplicationError>);
    expect(logger.error).toHaveBeenCalledWith(error, "failed to create session for credentials");
    expect(verifyPasswordHashMock).not.toHaveBeenCalled();
  });

  it("maps session creation failures to an unexpected ApplicationError", async () => {
    const service = createService();
    const error = new Error("db offline");

    userSessionRepository.create.mockRejectedValue(error);

    await expect(
      service.createSession({
        userId: enabledProfile.id,
      }),
    ).rejects.toMatchObject({
      code: "auth.session_create_failed",
      kind: "unexpected",
      details: { userId: enabledProfile.id },
    } satisfies Partial<ApplicationError>);
  });

  it("validates active sessions and returns the public user profile", async () => {
    const service = createService();
    const sessionId = "public-session-token";

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"));
    userSessionRepository.getBySessionID.mockResolvedValue(storedSession);
    userProfileRepository.getByID.mockResolvedValue(enabledProfile);

    await expect(service.validateSession({ sessionId })).resolves.toEqual({
      session: storedSession,
      user: {
        id: enabledProfile.id,
        username: enabledProfile.username,
        displayName: enabledProfile.displayName,
        email: enabledProfile.email,
        enabled: enabledProfile.enabled,
        roleIds: enabledProfile.roleIds,
      },
    });
    expect(userSessionRepository.getBySessionID).toHaveBeenCalledWith(hmacSessionId(sessionId));
    expect(userProfileRepository.getByID).toHaveBeenCalledWith(storedSession.userId);
  });

  it("maps session lookup failures during validation to an unexpected ApplicationError", async () => {
    const service = createService();

    userSessionRepository.getBySessionID.mockRejectedValue(new Error("db offline"));

    await expect(
      service.validateSession({ sessionId: "public-session-token" }),
    ).rejects.toMatchObject({
      code: "auth.session_validate_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });

  it("maps user lookup failures during validation to an unexpected ApplicationError", async () => {
    const service = createService();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"));
    userSessionRepository.getBySessionID.mockResolvedValue(storedSession);
    userProfileRepository.getByID.mockRejectedValue(new Error("db offline"));

    await expect(
      service.validateSession({ sessionId: "public-session-token" }),
    ).rejects.toMatchObject({
      code: "auth.session_validate_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });

  it("returns null when validating a missing session", async () => {
    const service = createService();

    userSessionRepository.getBySessionID.mockResolvedValue(null);

    await expect(
      service.validateSession({
        sessionId: "missing-session-token",
        correlationId: "auth-missing-session-request",
      }),
    ).resolves.toBeNull();
    expect(userProfileRepository.getByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual(["auth.failure"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.failure",
      source: "auth",
      correlationId: "auth-missing-session-request",
      data: {
        sessionId: "missing-session-token",
        reason: "invalid-session",
      },
    });
  });

  it("returns null when validating an expired session", async () => {
    const service = createService();
    const expiredSession = {
      ...storedSession,
      expiresAt: new Date("2026-04-26T07:59:59.000Z"),
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"));
    userSessionRepository.getBySessionID.mockResolvedValue(expiredSession);

    await expect(
      service.validateSession({ sessionId: "expired-session-token" }),
    ).resolves.toBeNull();
    expect(userProfileRepository.getByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual(["auth.failure"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.failure",
      source: "auth",
      data: {
        sessionId: "expired-session-token",
        reason: "session-expired",
      },
    });
  });

  it("returns null when validating a session for a deleted user", async () => {
    const service = createService();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"));
    userSessionRepository.getBySessionID.mockResolvedValue(storedSession);
    userProfileRepository.getByID.mockResolvedValue(null);

    await expect(
      service.validateSession({ sessionId: "deleted-user-session-token" }),
    ).resolves.toBeNull();
    expect(domainEvents.subjects()).toEqual(["auth.failure"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.failure",
      source: "auth",
      data: {
        sessionId: "deleted-user-session-token",
        reason: "unknown-user",
      },
    });
  });

  it("returns null when validating a session for a disabled user", async () => {
    const service = createService();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T08:00:00.000Z"));
    userSessionRepository.getBySessionID.mockResolvedValue(storedSession);
    userProfileRepository.getByID.mockResolvedValue({
      ...enabledProfile,
      enabled: false,
    });

    await expect(
      service.validateSession({ sessionId: "disabled-user-session-token" }),
    ).resolves.toBeNull();
    expect(domainEvents.subjects()).toEqual(["auth.failure"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.failure",
      source: "auth",
      data: {
        sessionId: "disabled-user-session-token",
        reason: "disabled-user",
      },
    });
  });

  it("revokes existing sessions by deleting the stored HMAC digest", async () => {
    const service = createService();
    const sessionId = "public-session-token";

    userSessionRepository.deleteBySessionID.mockResolvedValue(storedSession);

    await expect(
      service.revokeSession({
        sessionId,
        correlationId: "auth-revoke-session-request",
      }),
    ).resolves.toBe(true);
    expect(userSessionRepository.deleteBySessionID).toHaveBeenCalledWith(hmacSessionId(sessionId));
    expect(domainEvents.subjects()).toEqual(["auth.session.revoked"]);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "auth.session.revoked",
      source: "auth",
      correlationId: "auth-revoke-session-request",
      data: {
        session: storedSession,
      },
    });
  });

  it("returns false when revoking a missing session", async () => {
    const service = createService();

    userSessionRepository.deleteBySessionID.mockResolvedValue(null);

    await expect(service.revokeSession({ sessionId: "missing-session-token" })).resolves.toBe(
      false,
    );
  });

  it("maps session revocation failures to an unexpected ApplicationError", async () => {
    const service = createService();

    userSessionRepository.deleteBySessionID.mockRejectedValue(new Error("db offline"));

    await expect(
      service.revokeSession({ sessionId: "public-session-token" }),
    ).rejects.toMatchObject({
      code: "auth.session_revoke_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });
});
