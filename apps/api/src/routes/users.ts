import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { z } from "zod/v4"
import type { User } from "../repository/user.js"

interface UserRouteService {
  listAll(): Promise<User[]>
  getByID(id: string): Promise<User | null>
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

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

  return user
}
