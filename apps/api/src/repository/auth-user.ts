import type { Database } from "@exposurenexus/backend/database";
import type { Kysely } from "kysely";

export interface AuthUserProfile {
  id: string;
  username: string;
  displayName: string;
  email: string;
  enabled: boolean;
  passwordHash: string;
  roleIds: string[];
}

export interface AuthUserRepository {
  getByID(id: string): Promise<AuthUserProfile | null>;
  getByUsername(username: string): Promise<AuthUserProfile | null>;
}

export function createAuthUserRepository(database: Kysely<Database>): AuthUserRepository {
  async function attachRoleIds(
    profile: Omit<AuthUserProfile, "roleIds">,
  ): Promise<AuthUserProfile> {
    const assignments = await database
      .selectFrom("user_role_assignment")
      .select("roleId")
      .where("userId", "=", profile.id)
      .orderBy("roleId", "asc")
      .execute();

    return {
      ...profile,
      roleIds: assignments.map(({ roleId }) => roleId),
    };
  }

  return {
    async getByID(id: string): Promise<AuthUserProfile | null> {
      const profile = await database
        .selectFrom("user_profile")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      return profile ? await attachRoleIds(profile) : null;
    },

    async getByUsername(username: string): Promise<AuthUserProfile | null> {
      const profile = await database
        .selectFrom("user_profile")
        .selectAll()
        .where("username", "=", username)
        .executeTakeFirst();
      return profile ? await attachRoleIds(profile) : null;
    },
  };
}
