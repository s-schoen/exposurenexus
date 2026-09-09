import type { Generated } from "kysely";

export interface UserSessionTable {
  id: Generated<string>;
  sessionId: string;
  userId: string;
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}
