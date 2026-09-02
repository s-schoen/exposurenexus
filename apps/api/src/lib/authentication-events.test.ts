import { describe, expect, it, vi } from "vitest";

import { createDomainEventCollector } from "../test/eventbus.js";
import { decorateAuthenticationWithEvents } from "./authentication-events.js";

import type { Authentication } from "@exposurenexus/backend/authentication";

const user = {
  id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.com",
  enabled: true,
  roleIds: [],
};
const session = {
  id: "48f2e3a5-4560-4a47-85b6-137106940bbb",
  userId: user.id,
  sourceIp: "203.0.113.10",
  userAgent: "Mozilla/5.0",
  createdAt: new Date("2026-04-26T08:00:00.000Z"),
  expiresAt: new Date("2026-04-26T20:00:00.000Z"),
};
const sessionToken = "public-session-token";
const persistedSessionDigest = "stored-session-id-digest";

function createRawAuthentication() {
  return {
    createSessionForCredentials: vi.fn(),
    createSession: vi.fn(),
    validateSession: vi.fn(),
    revokeSession: vi.fn(),
  };
}

describe("authentication event decorator", () => {
  it("emits success and safe session metadata only after credential session creation resolves", async () => {
    const rawAuthentication = createRawAuthentication();
    const events = createDomainEventCollector();
    const authentication = decorateAuthenticationWithEvents(
      rawAuthentication as unknown as Authentication,
      events.emitter,
    );
    rawAuthentication.createSessionForCredentials.mockResolvedValue({
      authenticated: true,
      sessionToken,
      session: {
        ...session,
        sessionId: persistedSessionDigest,
      },
      user,
    });

    await expect(
      authentication.createSessionForCredentials({
        username: "alice",
        password: "correct-horse-battery-staple",
        sourceIp: session.sourceIp,
        userAgent: session.userAgent,
        correlationId: "auth-credentials-request",
      }),
    ).resolves.toEqual({
      sessionId: sessionToken,
      session,
      user,
    });

    expect(rawAuthentication.createSessionForCredentials).toHaveBeenCalledWith({
      username: "alice",
      password: "correct-horse-battery-staple",
      sourceIp: session.sourceIp,
      userAgent: session.userAgent,
    });
    expect(events.subjects()).toEqual(["auth.success", "auth.session.created"]);
    expect(events.events[0]).toMatchObject({
      subject: "auth.success",
      source: "auth",
      correlationId: "auth-credentials-request",
      data: { user },
    });
    expect(events.events[1]).toMatchObject({
      subject: "auth.session.created",
      source: "auth",
      correlationId: "auth-credentials-request",
      data: { session },
    });
    const serializedEvents = JSON.stringify(events.events);
    expect(serializedEvents).not.toContain(sessionToken);
    expect(serializedEvents).not.toContain(persistedSessionDigest);
    expect(serializedEvents).not.toContain("correct-horse-battery-staple");
  });

  it("emits no success event when credential session persistence fails", async () => {
    const rawAuthentication = createRawAuthentication();
    const events = createDomainEventCollector();
    const authentication = decorateAuthenticationWithEvents(
      rawAuthentication as unknown as Authentication,
      events.emitter,
    );
    rawAuthentication.createSessionForCredentials.mockRejectedValue(new Error("write failed"));

    await expect(
      authentication.createSessionForCredentials({
        username: "alice",
        password: "correct-horse-battery-staple",
        correlationId: "auth-credentials-request",
      }),
    ).rejects.toThrow("write failed");
    expect(events.events).toEqual([]);
  });

  it("emits credential failures without presented credentials", async () => {
    const rawAuthentication = createRawAuthentication();
    const events = createDomainEventCollector();
    const authentication = decorateAuthenticationWithEvents(
      rawAuthentication as unknown as Authentication,
      events.emitter,
    );
    rawAuthentication.createSessionForCredentials.mockResolvedValue({
      authenticated: false,
      reason: "invalid-credentials",
    });

    await expect(
      authentication.createSessionForCredentials({
        username: "alice",
        password: "wrong-password",
        correlationId: "auth-invalid-credentials-request",
      }),
    ).resolves.toBeNull();

    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      subject: "auth.failure",
      correlationId: "auth-invalid-credentials-request",
      data: { reason: "invalid-credentials" },
    });
    expect(events.events[0]!.data).toEqual({ reason: "invalid-credentials" });
    expect(JSON.stringify(events.events[0])).not.toContain("alice");
    expect(JSON.stringify(events.events[0])).not.toContain("wrong-password");
  });

  it("emits validation failures without the presented session token", async () => {
    const rawAuthentication = createRawAuthentication();
    const events = createDomainEventCollector();
    const authentication = decorateAuthenticationWithEvents(
      rawAuthentication as unknown as Authentication,
      events.emitter,
    );
    rawAuthentication.validateSession.mockResolvedValue({
      valid: false,
      reason: "invalid-session",
    });

    await expect(
      authentication.validateSession({
        sessionId: sessionToken,
        correlationId: "auth-invalid-session-request",
      }),
    ).resolves.toBeNull();

    expect(rawAuthentication.validateSession).toHaveBeenCalledWith({ sessionToken });
    expect(events.events[0]).toMatchObject({
      subject: "auth.failure",
      correlationId: "auth-invalid-session-request",
      data: { reason: "invalid-session" },
    });
    expect(JSON.stringify(events.events[0])).not.toContain(sessionToken);
  });

  it("emits safe session metadata for direct creation and revocation", async () => {
    const rawAuthentication = createRawAuthentication();
    const events = createDomainEventCollector();
    const authentication = decorateAuthenticationWithEvents(
      rawAuthentication as unknown as Authentication,
      events.emitter,
    );
    const sessionWithDigest = { ...session, sessionId: persistedSessionDigest };
    rawAuthentication.createSession.mockResolvedValue({
      sessionToken,
      session: sessionWithDigest,
      user,
    });
    rawAuthentication.revokeSession.mockResolvedValue({
      revoked: true,
      session: sessionWithDigest,
    });

    await authentication.createSession({ userId: user.id, actor: user.id });
    await expect(
      authentication.revokeSession({
        sessionId: sessionToken,
        actor: user.id,
      }),
    ).resolves.toBe(true);

    expect(events.subjects()).toEqual(["auth.session.created", "auth.session.revoked"]);
    expect(events.events[0]).toMatchObject({ actor: user.id, data: { session } });
    expect(events.events[1]).toMatchObject({ actor: user.id, data: { session } });
    expect(JSON.stringify(events.events)).not.toContain(sessionToken);
    expect(JSON.stringify(events.events)).not.toContain(persistedSessionDigest);
  });
});
