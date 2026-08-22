import type { UserProfile } from "@exposurenexus/contracts/model/user";

export type UserEventPayloads = {
  "user.created": {
    user: UserProfile;
  };
  "user.updated": {
    previous: UserProfile;
    current: UserProfile;
  };
};
