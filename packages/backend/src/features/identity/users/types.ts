export interface UserProfileRecord {
  id: string;
  username: string;
  displayName: string;
  email: string;
  enabled: boolean;
  passwordHash: string;
}

export interface UserProfileRecordWithRoles extends UserProfileRecord {
  roleIds: string[];
}
