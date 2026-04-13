import { z } from "zod/v4"

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

export type User = z.infer<typeof userSchema>
