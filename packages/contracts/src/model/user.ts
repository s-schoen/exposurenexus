import { z } from "zod/v4";

export const userProfileSchema = z.strictObject({
  id: z.uuidv4().nonempty(),
  username: z.string().nonempty(),
  displayName: z.string(),
  email: z.email().nonempty(),
  enabled: z.boolean(),
  roleIds: z.array(z.uuidv4()),
});

export const createUserProfileSchema = userProfileSchema
  .omit({
    id: true,
  })
  .extend({
    password: z.string().nonempty(),
  });

export const updateUserProfileSchema = userProfileSchema.omit({ id: true, username: true }).extend({
  password: z.string().nonempty().optional(),
});

export const userSessionSchema = z.strictObject({
  id: z.uuidv4().nonempty(),
  sessionId: z.string().nonempty(),
  userId: z.uuidv4().nonempty(),
  sourceIp: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
  expiresAt: z.date(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type CreateUserProfile = z.infer<typeof createUserProfileSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type UserSession = z.infer<typeof userSessionSchema>;
