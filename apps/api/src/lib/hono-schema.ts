import type { UserProfile, UserSession } from "@exposurenexus/contracts/model/user";

export interface ContextVariables {
  requestId: string;
  user: UserProfile | null;
  session: UserSession | null;
}
