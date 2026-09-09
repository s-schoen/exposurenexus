export type UserProfileApplicationErrorCatalog = {
  "user_profile.list_failed": { kind: "unexpected" };
  "user_profile.get_failed": {
    kind: "unexpected";
    details: { userProfileId: string };
  };
  "user_profile.get_by_username_failed": {
    kind: "unexpected";
    details: { username: string };
  };
  "user_profile.create_conflict": {
    kind: "conflict";
    details: { username: string; email: string };
  };
  "user_profile.role_assignment_invalid": {
    kind: "validation";
    details: { roleIds: readonly string[]; userProfileId?: string };
  };
  "user_profile.create_failed": {
    kind: "unexpected";
    details: { username: string; email: string };
  };
  "user_profile.update_conflict": {
    kind: "conflict";
    details: { userProfileId: string };
  };
  "user_profile.update_failed": {
    kind: "unexpected";
    details: { userProfileId: string };
  };
};
