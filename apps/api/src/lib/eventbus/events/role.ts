import type { Role } from "@openvlp/types/model/rbac"

export type RoleEventPayloads = {
  "role.updated": {
    previous: Role
    current: Role
  }
  "role.deleted": {
    role: Role
  }
}
