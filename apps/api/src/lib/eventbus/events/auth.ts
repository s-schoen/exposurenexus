import type { UserProfile, UserSession } from "@exposurenexus/contracts/model/user";

export type AuthFailureReason =
  | "invalid-credentials"
  | "invalid-session"
  | "session-expired"
  | "unknown-user"
  | "disabled-user";

export type AuthEventPayloads = {
  "auth.success": {
    user: UserProfile;
  };
  "auth.failure": {
    username?: string;
    sessionId?: string;
    reason: AuthFailureReason;
  };
  "auth.session.created": {
    user: UserProfile;
    session: UserSession;
  };
  "auth.session.revoked": {
    session: UserSession;
  };
};
