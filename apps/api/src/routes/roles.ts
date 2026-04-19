import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import type { Role } from "@openvlp/types/model/rbac"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { RequireDomainPermission } from "../middleware/auth.js"

interface RoleRouteService {
  listAll(): Promise<Role[]>
  getByID(id: string): Promise<Role | null>
}

interface RoleRouteDependencies {
  requireDomainPermission: RequireDomainPermission
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

export function createRoleRoute(
  roleService: RoleRouteService,
  { requireDomainPermission }: RoleRouteDependencies
) {
  const role = new Hono<{ Variables: ContextVariables }>()

  role.get("/", requireDomainPermission("user", "read"), async (c) => {
    const roles = await roleService.listAll()
    return replyArray(c, roles)
  })

  role.get(
    "/:id",
    requireDomainPermission("user", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const roleResult = await roleService.getByID(params.id)
      if (!roleResult) {
        notFound("role", params.id)
      }

      return replyObject(c, roleResult!)
    }
  )

  return role
}
