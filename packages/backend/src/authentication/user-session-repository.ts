import type { Database } from "../database/index.js";
import type { Kysely } from "kysely";

export interface UserSessionRecord {
  id: string;
  sessionId: string;
  userId: string;
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface UserSessionRepository {
  list(): Promise<UserSessionRecord[]>;
  getBySessionDigest(sessionDigest: string): Promise<UserSessionRecord | null>;
  create(session: Omit<UserSessionRecord, "id">): Promise<UserSessionRecord>;
  deleteBySessionDigest(sessionDigest: string): Promise<UserSessionRecord | null>;
  expireSessions(thresholdDate: Date): Promise<UserSessionRecord[]>;
}

export function createUserSessionRepository(database: Kysely<Database>): UserSessionRepository {
  return {
    async list(): Promise<UserSessionRecord[]> {
      return await database.selectFrom("user_session").selectAll().execute();
    },

    async getBySessionDigest(sessionDigest: string): Promise<UserSessionRecord | null> {
      const session = await database
        .selectFrom("user_session")
        .selectAll()
        .where("sessionId", "=", sessionDigest)
        .executeTakeFirst();

      return session || null;
    },

    async create(session: Omit<UserSessionRecord, "id">): Promise<UserSessionRecord> {
      const createdSession = await database
        .insertInto("user_session")
        .values(session)
        .returningAll()
        .executeTakeFirstOrThrow();

      return createdSession;
    },

    async deleteBySessionDigest(sessionDigest: string): Promise<UserSessionRecord | null> {
      const deletedSession = await database
        .deleteFrom("user_session")
        .where("sessionId", "=", sessionDigest)
        .returningAll()
        .executeTakeFirst();

      return deletedSession || null;
    },

    async expireSessions(thresholdDate: Date): Promise<UserSessionRecord[]> {
      return await database
        .deleteFrom("user_session")
        .where("expiresAt", "<", thresholdDate)
        .returningAll()
        .execute();
    },
  };
}
