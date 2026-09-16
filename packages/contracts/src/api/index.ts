import { z } from "zod/v4";

import { dateSchema } from "../model/date.js";
import { userProfileSchema } from "../model/user.js";

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
  username: z.string().min(1).regex(/\S/u),
  password: z.string().min(1),
});

export const authSessionReplySchema = z.strictObject({
  id: z.uuidv4().nonempty(),
  userId: z.uuidv4().nonempty(),
  sourceIp: z.string().nullable(),
  userAgent: z.string().nullable(),
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

export const registerImportSourceSchema = z.strictObject({
  source: z.literal("nuclei"),
  originalFilename: z.string().min(1).regex(/\S/u),
  sizeBytes: z.int().min(0),
  mimeType: z.string().optional(),
});

export const registerImportSourceDataReplySchema = z.strictObject({
  importSourceId: z.uuidv4(),
});

export const submitImportSourceDataReplySchema = z.strictObject({
  importSourceId: z.uuidv4(),
  ingestionId: z.uuidv4(),
  jobId: z.uuidv4(),
});

export type RegisterImportSource = z.infer<typeof registerImportSourceSchema>;
export type RegisterImportSourceDataReply = z.infer<typeof registerImportSourceDataReplySchema>;
export type SubmitImportSourceDataReply = z.infer<typeof submitImportSourceDataReplySchema>;
