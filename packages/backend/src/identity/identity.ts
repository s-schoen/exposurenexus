import * as sessionPersistence from "../authentication/session-persistence.js";
import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../runtime.js";
import * as authorizationPersistence from "./authorization-persistence.js";
import { createAuthorization } from "./authorization.js";
import * as rolePersistence from "./role-persistence.js";
import { createRoles } from "./roles.js";
import * as userProfilePersistence from "./user-profile-persistence.js";
import { createUsers } from "./users.js";

import type {
  PermissionResource,
  PermissionVerb,
  Role,
  CreateRole,
  UpdateRole,
} from "@exposurenexus/contracts/model/rbac";
import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile,
} from "@exposurenexus/contracts/model/user";

export type ResourcePermissionVerbAssignment = Partial<
  Record<PermissionResource, readonly PermissionVerb[]>
>;

export interface CreateUserCommand {
  userProfile: CreateUserProfile;
  performedBy: string;
}

export interface UpdateUserByIDCommand {
  id: string;
  userProfile: UpdateUserProfile;
  performedBy: string;
}

export interface UserCreatedOutcome {
  current: UserProfile;
  performedBy: string;
}

export interface UserUpdatedOutcome {
  previous: UserProfile;
  current: UserProfile;
  performedBy: string;
}

export interface IdentityUsers {
  listAll(): Promise<UserProfile[]>;
  getByID(id: string): Promise<UserProfile | null>;
  getByUsername(username: string): Promise<UserProfile | null>;
  create(command: CreateUserCommand): Promise<UserCreatedOutcome>;
  updateByID(command: UpdateUserByIDCommand): Promise<UserUpdatedOutcome | null>;
}

export interface CreateRoleCommand {
  role: CreateRole;
  performedBy: string;
}

export interface UpdateRoleByIDCommand {
  id: string;
  role: UpdateRole;
  performedBy: string;
}

export interface DeleteRoleByIDCommand {
  id: string;
  performedBy: string;
}

export interface RoleCreatedOutcome {
  current: Role;
  performedBy: string;
}

export interface RoleUpdatedOutcome {
  previous: Role;
  current: Role;
  changed: boolean;
  performedBy: string;
}

export interface RoleDeletedOutcome {
  previous: Role;
  performedBy: string;
}

export interface IdentityRoles {
  listAll(): Promise<Role[]>;
  getByID(id: string): Promise<Role | null>;
  getByNames(names: readonly string[]): Promise<Role[]>;
  resolveRoleIdsFromNames(names: readonly string[]): Promise<string[]>;
  requireRoleNamesFromIds(ids: readonly string[]): Promise<string[]>;
  create(command: CreateRoleCommand): Promise<RoleCreatedOutcome>;
  updateByID(command: UpdateRoleByIDCommand): Promise<RoleUpdatedOutcome | null>;
  deleteByID(command: DeleteRoleByIDCommand): Promise<RoleDeletedOutcome | null>;
}

export interface IdentityAuthorization {
  userHasPermission(
    userId: string,
    permissions: ResourcePermissionVerbAssignment,
  ): Promise<boolean>;
}

export interface Identity {
  users: IdentityUsers;
  roles: IdentityRoles;
  authorization: IdentityAuthorization;
}

const identityRuntimeKey = {};

export function createIdentity(runtime: BackendRuntime): Identity {
  return getOrCreateRuntimeValue(runtime, identityRuntimeKey, () => {
    const database = getRuntimeDatabase(runtime);
    const logger = getRuntimeLogger(runtime);

    return {
      users: createUsers({
        database,
        userProfilePersistence,
        sessionPersistence,
        logger: logger.child({ capability: "identity", component: "users" }),
      }),
      roles: createRoles({
        database,
        rolePersistence,
        sessionPersistence,
        logger: logger.child({ capability: "identity", component: "roles" }),
      }),
      authorization: createAuthorization({
        database,
        authorizationPersistence,
        logger: logger.child({ capability: "identity", component: "authorization" }),
      }),
    } satisfies Identity;
  });
}
