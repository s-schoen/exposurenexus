import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { z } from "zod/v4"
import type { User } from "@openvlp/types/model/user"

const createUserSchema = z.strictObject({
  name: z.string().trim().min(1),
  email: z.email(),
  username: z.string().trim().min(1),
  displayUsername: z.string().trim().min(1),
  password: z.string().min(1)
})

const updateUserSchema = z.strictObject({
  name: z.string().trim().min(1),
  email: z.email(),
  displayUsername: z.string().trim().min(1),
  image: z.string().nullable(),
  password: z.string().min(1)
})

interface UserRouteService {
  listAll(): Promise<User[]>
  getByID(id: string): Promise<User | null>
  create(user: z.infer<typeof createUserSchema>): Promise<User>
  updateByID(
    id: string,
    user: z.infer<typeof updateUserSchema>
  ): Promise<User | null>
}

const idParamValidator = zValidator("param", z.object({ id: z.string() }))

export function createUserRoute(userService: UserRouteService) {
  const user = new Hono()

  user.get("/", async (c) => {
    const users = await userService.listAll()
    return replyArray(c, users)
  })

  user.get("/:id", idParamValidator, async (c) => {
    const params = c.req.valid("param")

    const userResult = await userService.getByID(params.id)
    if (!userResult) {
      notFound("user", params.id)
    }

    return replyObject(c, userResult!)
  })

  user.post("/", zValidator("json", createUserSchema), async (c) => {
    const body = c.req.valid("json")
    const createdUser = await userService.create(body)
    return replyObject(c, createdUser, true)
  })

  user.put(
    "/:id",
    idParamValidator,
    zValidator("json", updateUserSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      const updatedUser = await userService.updateByID(params.id, body)
      if (!updatedUser) {
        notFound("user", params.id)
      }

      return replyObject(c, updatedUser!)
    }
  )

  return user
}
