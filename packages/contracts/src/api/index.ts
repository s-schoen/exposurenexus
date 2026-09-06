import { z } from "zod/v4";

import { dateSchema } from "../model/date.js";
import { userProfileSchema, userSessionSchema } from "../model/user.js";

interface APIReply {
  correlationId: string;
}

export interface APISingleDataReply<T extends object> extends APIReply {
  data: T;
}

export interface APIArrayDataReply<T extends object> extends APIReply {
  data: {
    currentItemCount: number;
    startIndex: number;
    totalItems: number;
    items: T[];
  };
}

export interface APIErrorReply extends APIReply {
  status: number;
  error: string;
  reason?: string;
}

export const authLoginSchema = z.strictObject({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const authSessionReplySchema = userSessionSchema.omit({ sessionId: true }).extend({
  createdAt: dateSchema,
  expiresAt: dateSchema,
});

export const authSessionDataReplySchema = z.strictObject({
  user: userProfileSchema,
  session: authSessionReplySchema,
});

export const authSignOutDataReplySchema = z.strictObject({
  revoked: z.boolean(),
});

export type AuthLogin = z.infer<typeof authLoginSchema>;
export type AuthSessionReply = z.infer<typeof authSessionReplySchema>;
export type AuthSessionDataReply = z.infer<typeof authSessionDataReplySchema>;
export type AuthSignOutDataReply = z.infer<typeof authSignOutDataReplySchema>;

export function createObjectReply<T extends object>(
  correlationId: string,
  data: T,
): APISingleDataReply<T> {
  return { correlationId, data };
}

export function createArrayReply<T extends object>(
  correlationId: string,
  data: T[],
): APIArrayDataReply<T> {
  return {
    correlationId,
    data: {
      items: data,
      totalItems: data.length,
      startIndex: 0,
      currentItemCount: data.length,
    },
  };
}
