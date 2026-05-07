import type { UserProfile, UserSession } from "@openvlp/types/model/user"

export interface ContextVariables {
  requestId: string
  user: UserProfile | null
  session: UserSession | null
}
