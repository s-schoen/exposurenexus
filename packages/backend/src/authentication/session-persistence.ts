import type { DatabaseExecutor } from "../database/executor.js";
import type { UserSessionRecord } from "./types.js";

export async function listUserSessions(database: DatabaseExecutor): Promise<UserSessionRecord[]> {
  return await database.selectFrom("user_session").selectAll().execute();
}

export async function getUserSessionByDigest(
  database: DatabaseExecutor,
  sessionDigest: string,
): Promise<UserSessionRecord | null> {
  const session = await database
    .selectFrom("user_session")
    .selectAll()
    .where("sessionId", "=", sessionDigest)
    .executeTakeFirst();

  return session || null;
}

export async function insertUserSession(
  database: DatabaseExecutor,
  session: Omit<UserSessionRecord, "id">,
): Promise<UserSessionRecord> {
  return await database
    .insertInto("user_session")
    .values(session)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteUserSessionByDigest(
  database: DatabaseExecutor,
  sessionDigest: string,
): Promise<UserSessionRecord | null> {
  const deletedSession = await database
    .deleteFrom("user_session")
    .where("sessionId", "=", sessionDigest)
    .returningAll()
    .executeTakeFirst();

  return deletedSession || null;
}

export async function expireUserSessions(
  database: DatabaseExecutor,
  thresholdDate: Date,
): Promise<UserSessionRecord[]> {
  return await database
    .deleteFrom("user_session")
    .where("expiresAt", "<", thresholdDate)
    .returningAll()
    .execute();
}

export async function deleteSessionsByUserID(
  database: DatabaseExecutor,
  userId: string,
): Promise<number> {
  const deletedSessions = await database
    .deleteFrom("user_session")
    .where("userId", "=", userId)
    .returning("id")
    .execute();

  return deletedSessions.length;
}

export async function deleteSessionsByUserIDs(
  database: DatabaseExecutor,
  userIds: readonly string[],
): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }

  const deletedSessions = await database
    .deleteFrom("user_session")
    .where("userId", "in", [...userIds])
    .returning("id")
    .execute();

  return deletedSessions.length;
}
