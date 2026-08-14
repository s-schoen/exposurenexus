import type { Role } from "@exposurenexus/types/model/rbac";

export type RoleEventPayloads = {
  "role.created": {
    role: Role;
  };
  "role.updated": {
    previous: Role;
    current: Role;
  };
  "role.deleted": {
    role: Role;
  };
};
