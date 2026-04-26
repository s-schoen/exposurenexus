import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import {
  createUserProfileSchema,
  updateUserProfileSchema,
  type CreateUserProfile,
  type UpdateUserProfile,
  type UserProfile
} from "@openvlp/types/model/user"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { z } from "zod/v4"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"

interface UserRouteService {
  listAll(): Promise<UserProfile[]>
  getByID(id: string): Promise<UserProfile | null>
  create(user: CreateUserProfile): Promise<UserProfile>
  updateByID(id: string, user: UpdateUserProfile): Promise<UserProfile | null>
}

interface UserRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

export function createUserRoute(
  userService: UserRouteService,
  { requireDomainPermission }: UserRouteDependencies
) {
  const user = new Hono<{ Variables: ContextVariables }>()

  user.get("/", requireDomainPermission("user", "read"), async (c) => {
    const users = await userService.listAll()
    return replyArray(c, users)
  })

  user.get(
    "/:id",
    requireDomainPermission("user", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const userResult = await userService.getByID(params.id)
      if (!userResult) {
        notFound("user", params.id)
      }

      return replyObject(c, userResult!)
    }
  )

  user.post(
    "/",
    requireDomainPermission("user", "write"),
    zValidator("json", createUserProfileSchema),
    async (c) => {
      const body = c.req.valid("json")
      const createdUser = await userService.create(body)
      return replyObject(c, createdUser, true)
    }
  )

  user.put(
    "/:id",
    requireDomainPermission("user", "write"),
    idParamValidator,
    zValidator("json", updateUserProfileSchema),
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
