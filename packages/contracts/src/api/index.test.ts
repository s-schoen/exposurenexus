import { describe, expect, it } from "vitest";

import {
  authLoginSchema,
  authSessionDataReplySchema,
  authSessionReplySchema,
  authSignOutDataReplySchema,
} from "./index.js";

const serializedSession = {
  id: "11003daa-67df-40e4-894f-ada5de7bd1be",
  userId: "8b2648c7-945c-49bb-9a3f-66e02a35df52",
  sourceIp: "203.0.113.10",
  userAgent: "Mozilla/5.0",
  createdAt: "2026-08-31T12:00:00.000Z",
  expiresAt: "2026-09-01T12:00:00.000Z",
};

const user = {
  id: serializedSession.userId,
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.com",
  enabled: true,
  roleIds: ["fce4b0c8-f63f-4b21-84f5-f5f4de71f9cb"],
};

describe("auth API schemas", () => {
  it("trims usernames and requires non-empty credentials", () => {
    expect(authLoginSchema.parse({ username: " alice ", password: "secret" })).toEqual({
      username: "alice",
      password: "secret",
    });

    expect(authLoginSchema.safeParse({ username: "   ", password: "secret" }).success).toBe(false);
    expect(authLoginSchema.safeParse({ username: "alice", password: "" }).success).toBe(false);
  });

  it("decodes serialized session dates", () => {
    expect(
      authSessionDataReplySchema.parse({
        user,
        session: serializedSession,
      }),
    ).toEqual({
      user,
      session: {
        ...serializedSession,
        createdAt: new Date(serializedSession.createdAt),
        expiresAt: new Date(serializedSession.expiresAt),
      },
    });
  });

  it("rejects malformed session and sign-out replies", () => {
    expect(
      authSessionReplySchema.safeParse({ ...serializedSession, sessionId: "private-token" })
        .success,
    ).toBe(false);
    expect(
      authSessionDataReplySchema.safeParse({
        user,
        session: { ...serializedSession, expiresAt: "not-a-date" },
      }).success,
    ).toBe(false);
    expect(authSignOutDataReplySchema.safeParse({ revoked: "yes" }).success).toBe(false);
  });
});
