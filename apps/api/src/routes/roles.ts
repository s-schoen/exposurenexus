import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import {
  createRoleSchema,
  updateRoleSchema,
  type Role,
  type CreateRole,
  type UpdateRole
} from "@exposurenexus/types/model/rbac"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import type { ContextVariables } from "../lib/hono-schema.js"
import type { DomainEventContext } from "../lib/eventbus/events/index.js"
import { requestEventContext } from "../lib/request-event-context.js"
import type { RequireDomainPermission } from "../middleware/auth.js"

interface RoleRouteService {
  listAll(): Promise<Role[]>
  getByID(id: string): Promise<Role | null>
  create(options: {
    role: CreateRole
    eventContext?: DomainEventContext
  }): Promise<Role>
  updateByID(options: {
    id: string
    role: UpdateRole
    eventContext?: DomainEventContext
  }): Promise<Role | null>
  deleteByID(options: {
    id: string
    eventContext?: DomainEventContext
  }): Promise<Role | null>
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

  role.post(
    "/",
    requireDomainPermission("user", "write"),
    zValidator("json", createRoleSchema),
    async (c) => {
      const body = c.req.valid("json")

      const createdRole = await roleService.create({
        role: body,
        eventContext: requestEventContext(c)
      })

      return replyObject(c, createdRole, true)
    }
  )

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

  role.put(
    "/:id",
    requireDomainPermission("user", "write"),
    idParamValidator,
    zValidator("json", updateRoleSchema),
    async (c) => {
      const params = c.req.valid("param")
      const body = c.req.valid("json")

      const updatedRole = await roleService.updateByID({
        id: params.id,
        role: body,
        eventContext: requestEventContext(c)
      })
      if (!updatedRole) {
        notFound("role", params.id)
      }

      return replyObject(c, updatedRole!)
    }
  )

  role.delete(
    "/:id",
    requireDomainPermission("user", "delete"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param")

      const deletedRole = await roleService.deleteByID({
        id: params.id,
        eventContext: requestEventContext(c)
      })
      if (!deletedRole) {
        notFound("role", params.id)
      }

      return replyObject(c, deletedRole!)
    }
  )

  return role
}
