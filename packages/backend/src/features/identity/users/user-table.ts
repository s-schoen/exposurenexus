import type { Generated } from "kysely";

export interface UserProfileTable {
  id: Generated<string>;
  username: string;
  email: string;
  displayName: string;
  enabled: boolean;
  passwordHash: string;
}
