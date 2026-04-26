import type { UserProfile, UserSession } from "@openvlp/types/model/user"

export interface ContextVariables {
  user: UserProfile | null
  session: UserSession | null
}
