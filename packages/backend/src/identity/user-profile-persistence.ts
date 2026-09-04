import type { DatabaseExecutor } from "../database/executor.js";
import type { UserProfileRecord, UserProfileRecordWithRoles } from "./types.js";

type UserProfileInput = Omit<UserProfileRecord, "id">;

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
  profiles: UserProfileRecord[],
): Promise<UserProfileRecordWithRoles[]> {
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
  {
    userId,
    roleIds,
  }: {
    userId: string;
    roleIds: readonly string[];
  },
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

export async function listUserProfiles(
  database: DatabaseExecutor,
): Promise<UserProfileRecordWithRoles[]> {
  const profiles = await database.selectFrom("user_profile").selectAll().execute();
  return await attachRoleIds(database, profiles);
}

export async function getUserProfileByID(
  database: DatabaseExecutor,
  id: string,
): Promise<UserProfileRecordWithRoles | null> {
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
}

export async function getUserProfileByUsername(
  database: DatabaseExecutor,
  username: string,
): Promise<UserProfileRecordWithRoles | null> {
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
}

export async function insertUserProfile(
  database: DatabaseExecutor,
  {
    userProfile,
    roleIds,
  }: {
    userProfile: UserProfileInput;
    roleIds: readonly string[];
  },
): Promise<UserProfileRecordWithRoles> {
  const createdProfile = await database
    .insertInto("user_profile")
    .values({
      ...userProfile,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const assignedRoleIds = await replaceRoleAssignments(database, {
    userId: createdProfile.id,
    roleIds,
  });

  return {
    ...createdProfile,
    roleIds: assignedRoleIds,
  };
}

export async function updateUserProfile(
  database: DatabaseExecutor,
  {
    id,
    userProfile,
    roleIds,
  }: {
    id: string;
    userProfile: UserProfileInput;
    roleIds: readonly string[];
  },
): Promise<UserProfileRecordWithRoles | null> {
  const updated = await database
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

  const assignedRoleIds = await replaceRoleAssignments(database, { userId: id, roleIds });

  return {
    ...updated,
    roleIds: assignedRoleIds,
  };
}
