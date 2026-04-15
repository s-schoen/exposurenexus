import { z } from "zod/v4"

export const createUserSchema = z.strictObject({
  name: z.string().trim().min(1),
  email: z.email(),
  username: z.string().trim().min(1),
  displayUsername: z.string().trim().min(1),
  password: z.string().min(1)
})

export const updateUserSchema = z.strictObject({
  name: z.string().trim().min(1),
  email: z.email(),
  displayUsername: z.string().trim().min(1),
  image: z.string().nullable(),
  password: z.string().min(1).optional()
})

export const userSchema = z.strictObject({
  id: z.string().nonempty(),
  name: z.string().nonempty(),
  username: z.string().nullable(),
  displayUsername: z.string().nullable(),
  email: z.email(),
  emailVerified: z.boolean,
  image: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type CreateUser = z.infer<typeof createUserSchema>
export type UpdateUser = z.infer<typeof updateUserSchema>
export type User = z.infer<typeof userSchema>
