import type { Database } from "@exposurenexus/backend/database";
import type {
  UserProfileInternal,
  UserProfileInternalWithRoles,
} from "@exposurenexus/contracts/model/user";
import type { Kysely, Transaction } from "kysely";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

export interface UpdateUserProfileByIDOptions {
  id: string;
  userProfile: Omit<UserProfileInternal, "id">;
  roleIds: readonly string[];
  revokeSessions?: boolean;
}

export interface UpdateUserProfileByIDResult {
  userProfile: UserProfileInternalWithRoles;
  revokedSessionCount: number;
}

export interface UserProfileRepository {
  list(): Promise<UserProfileInternalWithRoles[]>;
  getByID(id: string): Promise<UserProfileInternalWithRoles | null>;
  getByUsername(username: string): Promise<UserProfileInternalWithRoles | null>;
  create(
    userProfile: Omit<UserProfileInternal, "id">,
    roleIds: readonly string[],
  ): Promise<UserProfileInternalWithRoles>;
  updateByID(options: UpdateUserProfileByIDOptions): Promise<UpdateUserProfileByIDResult | null>;
}

function uniqueRoleIds(roleIds: readonly string[]): string[] {
  return [...new Set(roleIds)];
}

async function listRoleIdsByUserIDs(
  database: DatabaseExecutor,
  userIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const rows = await database
    .selectFrom("user_role_assignment")
    .select(["userId", "roleId"])
    .where("userId", "in", [...userIds])
    .orderBy("roleId", "asc")
    .execute();
  const roleIdsByUserId = new Map<string, string[]>();

  for (const row of rows) {
    const roleIds = roleIdsByUserId.get(row.userId) ?? [];
    roleIds.push(row.roleId);
    roleIdsByUserId.set(row.userId, roleIds);
  }

  return roleIdsByUserId;
}

async function attachRoleIds(
  database: DatabaseExecutor,
  profiles: UserProfileInternal[],
): Promise<UserProfileInternalWithRoles[]> {
  const roleIdsByUserId = await listRoleIdsByUserIDs(
    database,
    profiles.map((profile) => profile.id),
  );

  return profiles.map((profile) => ({
    ...profile,
    roleIds: roleIdsByUserId.get(profile.id) ?? [],
  }));
}

async function replaceRoleAssignments(
  database: DatabaseExecutor,
  userId: string,
  roleIds: readonly string[],
): Promise<string[]> {
  const distinctRoleIds = uniqueRoleIds(roleIds);

  await database.deleteFrom("user_role_assignment").where("userId", "=", userId).execute();

  if (distinctRoleIds.length > 0) {
    await database
      .insertInto("user_role_assignment")
      .values(
        distinctRoleIds.map((roleId) => ({
          userId,
          roleId,
        })),
      )
      .execute();
  }

  return distinctRoleIds;
}

async function deleteSessionsByUserID(database: DatabaseExecutor, userId: string): Promise<number> {
  const deletedSessions = await database
    .deleteFrom("user_session")
    .where("userId", "=", userId)
    .returning("id")
    .execute();

  return deletedSessions.length;
}

export function createUserProfileRepository(database: Kysely<Database>): UserProfileRepository {
  return {
    async list(): Promise<UserProfileInternalWithRoles[]> {
      const profiles = await database.selectFrom("user_profile").selectAll().execute();
      return await attachRoleIds(database, profiles);
    },

    async getByID(id: string): Promise<UserProfileInternalWithRoles | null> {
      const profile = await database
        .selectFrom("user_profile")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      if (!profile) {
        return null;
      }

      const [profileWithRoles] = await attachRoleIds(database, [profile]);
      return profileWithRoles!;
    },

    async getByUsername(username: string): Promise<UserProfileInternalWithRoles | null> {
      const profile = await database
        .selectFrom("user_profile")
        .selectAll()
        .where("username", "=", username)
        .executeTakeFirst();

      if (!profile) {
        return null;
      }

      const [profileWithRoles] = await attachRoleIds(database, [profile]);
      return profileWithRoles!;
    },

    async create(
      userProfile: Omit<UserProfileInternal, "id">,
      roleIds: readonly string[],
    ): Promise<UserProfileInternalWithRoles> {
      return await database.transaction().execute(async (trx) => {
        const createdProfile = await trx
          .insertInto("user_profile")
          .values({
            ...userProfile,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        const assignedRoleIds = await replaceRoleAssignments(trx, createdProfile.id, roleIds);

        return {
          ...createdProfile,
          roleIds: assignedRoleIds,
        };
      });
    },

    async updateByID({
      id,
      userProfile,
      roleIds,
      revokeSessions = false,
    }: UpdateUserProfileByIDOptions): Promise<UpdateUserProfileByIDResult | null> {
      return await database.transaction().execute(async (trx) => {
        const updated = await trx
          .updateTable("user_profile")
          .set({
            ...userProfile,
          })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirst();

        if (!updated) {
          return null;
        }

        const assignedRoleIds = await replaceRoleAssignments(trx, id, roleIds);
        const revokedSessionCount = revokeSessions ? await deleteSessionsByUserID(trx, id) : 0;

        return {
          userProfile: {
            ...updated,
            roleIds: assignedRoleIds,
          },
          revokedSessionCount,
        };
      });
    },
  };
}
