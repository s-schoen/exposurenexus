import type { UserProfile } from "@openvlp/types/model/user"

export type UserEventPayloads = {
  "user.created": {
    user: UserProfile
  }
  "user.updated": {
    previous: UserProfile
    current: UserProfile
  }
  "user.deleted": {
    user: UserProfile
  }
}
