export interface UserSessionRecord {
  id: string;
  sessionId: string;
  userId: string;
  sourceIp: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}
