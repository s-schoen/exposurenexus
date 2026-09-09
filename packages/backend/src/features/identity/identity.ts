import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../../runtime.js";
import * as sessionPersistence from "../authentication/session-persistence.js";
import * as authorizationPersistence from "./authorization/authorization-persistence.js";
import { createAuthorization } from "./authorization/authorization.js";
import * as rolePersistence from "./roles/role-persistence.js";
import { createRoles } from "./roles/roles.js";
import * as userProfilePersistence from "./users/user-profile-persistence.js";
import { createUsers } from "./users/users.js";

import type { IdentityAuthorization } from "./authorization/commands.js";
import type { IdentityRoles } from "./roles/commands.js";
import type { IdentityUsers } from "./users/commands.js";

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
