import type { AuthenticationSession } from "@exposurenexus/backend/authentication";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

export interface ContextVariables {
  requestId: string;
  user: UserProfile | null;
  session: AuthenticationSession | null;
}
