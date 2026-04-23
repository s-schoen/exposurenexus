import { z } from "zod/v4"

export const createUserSchema = z.strictObject({
  name: z.string().trim().min(1),
  email: z.email(),
  username: z.string().trim().min(1),
  displayUsername: z.string().trim().min(1),
  password: z.string().min(1),
  roleIds: z.array(z.uuidv4()).optional()
})

export const updateUserSchema = z.strictObject({
  name: z.string().trim().min(1),
  email: z.email(),
  displayUsername: z.string().trim().min(1),
  image: z.string().nullable(),
  password: z.string().min(1).optional(),
  roleIds: z.array(z.uuidv4()).optional()
})

export const userSchema = z.strictObject({
  id: z.string().nonempty(),
  name: z.string().nonempty(),
  username: z.string().nullable(),
  displayUsername: z.string().nullable(),
  email: z.email(),
  emailVerified: z.boolean,
  image: z.string().nullable(),
  roleIds: z.array(z.uuidv4()),
  createdAt: z.date(),
  updatedAt: z.date()
})

export const userProfileInternalSchema = z.strictObject({
  id: z.uuidv4().nonempty(),
  username: z.string().nonempty(),
  displayName: z.string(),
  email: z.email().nonempty(),
  enabled: z.boolean(),
  passwordHash: z.string().nonempty()
})

export const userProfileSchema = userProfileInternalSchema.omit({
  passwordHash: true
})

export type CreateUser = z.infer<typeof createUserSchema>
export type UpdateUser = z.infer<typeof updateUserSchema>
export type User = z.infer<typeof userSchema>
export type UserProfileInternal = z.infer<typeof userProfileInternalSchema>
export type UserProfile = z.infer<typeof userProfileSchema>
