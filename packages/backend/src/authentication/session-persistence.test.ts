import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../database/test/database.js";
import {
  deleteUserSessionByDigest,
  expireUserSessions,
  getUserSessionByDigest,
  insertUserSession,
  listUserSessions,
} from "./session-persistence.js";

describe("session persistence", () => {
  const testDb = createTestDatabase();
  const firstUserId = "ca8be35f-b523-47d1-a9d8-743dc272c0cb";
  const secondUserId = "61b657d7-92b6-4a82-b937-82e38177707a";

  beforeAll(async () => {
    await testDb.start();
  });

  afterAll(async () => {
    await testDb.dispose();
  });

  beforeEach(async () => {
    await resetTestDatabase(testDb.db);
    await testDb.db
      .insertInto("user_profile")
      .values([
        {
          id: firstUserId,
          username: "alice",
          displayName: "Alice",
          email: "alice@example.com",
          enabled: true,
          passwordHash: "hash-alice",
        },
        {
          id: secondUserId,
          username: "bob",
          displayName: "Bob",
          email: "bob@example.com",
          enabled: true,
          passwordHash: "hash-bob",
        },
      ])
      .execute();
  });

  it("creates, lists, loads, and deletes a session by digest", async () => {
    const session = await insertUserSession(testDb.db, {
      sessionId: "session-digest-first",
      userId: firstUserId,
      sourceIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      expiresAt: new Date("2026-04-23T10:00:00.000Z"),
    });

    await expect(getUserSessionByDigest(testDb.db, session.sessionId)).resolves.toEqual(session);
    await expect(listUserSessions(testDb.db)).resolves.toEqual([session]);
    await expect(deleteUserSessionByDigest(testDb.db, session.sessionId)).resolves.toEqual(session);
    await expect(getUserSessionByDigest(testDb.db, session.sessionId)).resolves.toBeNull();
  });

  it("expires only sessions older than the threshold", async () => {
    const expired = await insertUserSession(testDb.db, {
      sessionId: "session-digest-expired",
      userId: firstUserId,
      sourceIp: null,
      userAgent: null,
      createdAt: new Date("2026-04-23T08:00:00.000Z"),
      expiresAt: new Date("2026-04-23T09:59:59.000Z"),
    });
    const boundary = await insertUserSession(testDb.db, {
      sessionId: "session-digest-boundary",
      userId: firstUserId,
      sourceIp: null,
      userAgent: null,
      createdAt: new Date("2026-04-23T08:30:00.000Z"),
      expiresAt: new Date("2026-04-23T10:00:00.000Z"),
    });
    const unrelated = await insertUserSession(testDb.db, {
      sessionId: "session-digest-unrelated",
      userId: secondUserId,
      sourceIp: null,
      userAgent: null,
      createdAt: new Date("2026-04-23T09:00:00.000Z"),
      expiresAt: new Date("2026-04-23T10:00:01.000Z"),
    });

    await expect(
      expireUserSessions(testDb.db, new Date("2026-04-23T10:00:00.000Z")),
    ).resolves.toEqual([expired]);
    await expect(listUserSessions(testDb.db)).resolves.toEqual([boundary, unrelated]);
  });
});
