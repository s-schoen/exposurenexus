import type { UserProfile } from "@exposurenexus/types/model/user";

export type UserEventPayloads = {
  "user.created": {
    user: UserProfile;
  };
  "user.updated": {
    previous: UserProfile;
    current: UserProfile;
  };
};
