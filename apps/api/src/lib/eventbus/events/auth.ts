import type {
  AuthenticationFailureReason,
  AuthenticationSession,
} from "@exposurenexus/backend/authentication";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

export type AuthFailureReason = AuthenticationFailureReason;

export type AuthEventPayloads = {
  "auth.success": {
    user: UserProfile;
  };
  "auth.failure": {
    reason: AuthFailureReason;
  };
  "auth.session.created": {
    session: AuthenticationSession;
  };
  "auth.session.revoked": {
    session: AuthenticationSession;
  };
};
