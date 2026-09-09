import { createHmac, randomBytes } from "node:crypto";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createSessionDigest(sessionToken: string, secret: string): string {
  return createHmac("sha256", secret).update(sessionToken).digest("base64url");
}
