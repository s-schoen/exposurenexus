import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
  type Role,
} from "@exposurenexus/contracts/model/rbac";
import { pino } from "pino";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { createDomainEventCollector } from "../test/eventbus.js";
import { createRoleService } from "./role.js";

import type { ApplicationError } from "./application-error.js";

describe("role service", () => {
  const domainEvents = createDomainEventCollector();
  const roleRepository = {
    list: vi.fn(),
    getByID: vi.fn(),
    getByIDs: vi.fn(),
    getByNames: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
    hasUsersWithRoleID: vi.fn(),
  };
  const logger = pino({ enabled: false });
  const viewerRole: Role = {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
  };
  const adminRole: Role = {
    id: builtInRoleIds.admin,
    name: BuiltInRoleName.Admin,
    permissions: [{ resource: PermissionResource.User, verb: PermissionVerb.Write }],
  };
  const analystRole: Role = {
    id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
    name: "analyst",
    permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
  };
  const eventContext = {
    actor: "95d5909c-a9ab-4350-a515-4b89eb1065ae",
    correlationId: "role-service-request",
  };

  function createService() {
    return createRoleService({
      roleRepository,
      domainEventEmitter: domainEvents.emitter,
      logger,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.clear();
    roleRepository.hasUsersWithRoleID.mockResolvedValue(false);
  });

  it("gets roles by name", async () => {
    const service = createService();

    roleRepository.getByNames.mockResolvedValue([viewerRole, adminRole]);

    await expect(
      service.getByNames([BuiltInRoleName.Viewer, BuiltInRoleName.Admin]),
    ).resolves.toEqual([viewerRole, adminRole]);
    expect(roleRepository.getByNames).toHaveBeenCalledWith([
      BuiltInRoleName.Viewer,
      BuiltInRoleName.Admin,
    ]);
  });

  it("maps get-by-name failures to an unexpected ApplicationError", async () => {
    const service = createService();

    roleRepository.getByNames.mockRejectedValueOnce(new Error("db offline"));

    await expect(service.getByNames([BuiltInRoleName.Viewer])).rejects.toMatchObject({
      code: "role.get_by_names_failed",
      kind: "unexpected",
      details: { roleNames: [BuiltInRoleName.Viewer] },
    } satisfies Partial<ApplicationError>);
  });

  it("lists all roles", async () => {
    const service = createService();

    roleRepository.list.mockResolvedValue([adminRole, viewerRole]);

    await expect(service.listAll()).resolves.toEqual([adminRole, viewerRole]);
    expect(roleRepository.list).toHaveBeenCalledOnce();
  });

  it("maps list failures to an unexpected ApplicationError", async () => {
    const service = createService();

    roleRepository.list.mockRejectedValue(new Error("db offline"));

    await expect(service.listAll()).rejects.toMatchObject({
      code: "role.list_failed",
      kind: "unexpected",
    } satisfies Partial<ApplicationError>);
  });

  it("returns a role by id", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValue(viewerRole);

    await expect(service.getByID(viewerRole.id)).resolves.toEqual(viewerRole);
    expect(roleRepository.getByID).toHaveBeenCalledWith(viewerRole.id);
  });

  it("returns null when a role does not exist", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValue(null);

    await expect(service.getByID(viewerRole.id)).resolves.toBeNull();
  });

  it("maps get-by-id failures to an unexpected ApplicationError", async () => {
    const service = createService();

    roleRepository.getByID.mockRejectedValue(new Error("db offline"));

    await expect(service.getByID(viewerRole.id)).rejects.toMatchObject({
      code: "role.get_failed",
      kind: "unexpected",
      details: { roleId: viewerRole.id },
    } satisfies Partial<ApplicationError>);
  });

  it("creates a custom role and emits a domain event", async () => {
    const service = createService();
    const createRole = {
      name: "security-analyst",
      permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
    };
    const createdRole = {
      ...analystRole,
      ...createRole,
    };

    roleRepository.create.mockResolvedValue(createdRole);

    await expect(service.create(createRole, eventContext)).resolves.toEqual(createdRole);
    expect(roleRepository.create).toHaveBeenCalledWith(createRole);
    expect(domainEvents.subjects()).toEqual(["role.created"]);
    expect(domainEvents.eventsFor("role.created")[0]).toMatchObject({
      subject: "role.created",
      source: "role",
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        role: createdRole,
      },
    });
  });

  it("maps duplicate role name creates to a conflict ApplicationError", async () => {
    const service = createService();

    roleRepository.create.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );

    await expect(
      service.create({
        name: BuiltInRoleName.Viewer,
        permissions: [],
      }),
    ).rejects.toMatchObject({
      code: "role.create_conflict",
      kind: "conflict",
      details: { roleName: BuiltInRoleName.Viewer },
    } satisfies Partial<ApplicationError>);
  });

  it("maps role create failures to an unexpected ApplicationError", async () => {
    const service = createService();

    roleRepository.create.mockRejectedValue(new Error("db offline"));

    await expect(
      service.create({
        name: "security-analyst",
        permissions: [],
      }),
    ).rejects.toMatchObject({
      code: "role.create_failed",
      kind: "unexpected",
      details: { roleName: "security-analyst" },
    } satisfies Partial<ApplicationError>);
  });

  it("resolves role ids from persisted role names", async () => {
    const service = createService();

    roleRepository.getByNames.mockResolvedValue([viewerRole, adminRole]);

    await expect(
      service.resolveRoleIdsFromNames([BuiltInRoleName.Viewer, BuiltInRoleName.Admin]),
    ).resolves.toEqual([builtInRoleIds.viewer, builtInRoleIds.admin]);
    expect(roleRepository.getByNames).toHaveBeenCalledWith([
      BuiltInRoleName.Viewer,
      BuiltInRoleName.Admin,
    ]);
  });

  it("requires known role ids and resolves them to role names", async () => {
    const service = createService();

    roleRepository.getByIDs.mockResolvedValue([adminRole, viewerRole]);

    await expect(
      service.requireRoleNamesFromIds([
        builtInRoleIds.admin,
        builtInRoleIds.viewer,
        builtInRoleIds.admin,
      ]),
    ).resolves.toEqual([BuiltInRoleName.Admin, BuiltInRoleName.Viewer]);
    expect(roleRepository.getByIDs).toHaveBeenCalledWith([
      builtInRoleIds.admin,
      builtInRoleIds.viewer,
    ]);
  });

  it("rejects unknown role ids with a validation ApplicationError", async () => {
    const service = createService();

    roleRepository.getByIDs.mockResolvedValue([viewerRole]);

    await expect(
      service.requireRoleNamesFromIds([
        builtInRoleIds.viewer,
        "0671d03d-57f1-49c8-8f62-5de6ed0924db",
      ]),
    ).rejects.toMatchObject({
      code: "role.unknown_ids",
      kind: "validation",
      details: { roleIds: ["0671d03d-57f1-49c8-8f62-5de6ed0924db"] },
    } satisfies Partial<ApplicationError>);
  });

  it("maps role resolution failures to an unexpected ApplicationError", async () => {
    const service = createService();

    roleRepository.getByNames.mockRejectedValueOnce(new Error("db offline"));

    await expect(service.resolveRoleIdsFromNames([BuiltInRoleName.Viewer])).rejects.toMatchObject({
      code: "role.resolve_ids_failed",
      kind: "unexpected",
      details: { roleNames: [BuiltInRoleName.Viewer] },
    } satisfies Partial<ApplicationError>);
  });

  it("maps role-name resolution failures to an unexpected ApplicationError", async () => {
    const service = createService();

    roleRepository.getByIDs.mockRejectedValueOnce(new Error("db offline"));

    await expect(service.requireRoleNamesFromIds([builtInRoleIds.viewer])).rejects.toMatchObject({
      code: "role.resolve_names_failed",
      kind: "unexpected",
      details: { roleIds: [builtInRoleIds.viewer] },
    } satisfies Partial<ApplicationError>);
  });

  it("updates a custom role", async () => {
    const service = createService();
    const updatedRole = {
      ...analystRole,
      name: "security-analyst",
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      ],
    };

    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.updateByID.mockResolvedValue({
      role: updatedRole,
      permissionsChanged: true,
      affectedUserCount: 2,
      revokedSessionCount: 3,
    });

    await expect(
      service.updateByID({
        id: analystRole.id,
        role: {
          name: "security-analyst",
          permissions: updatedRole.permissions,
        },
        eventContext,
      }),
    ).resolves.toEqual(updatedRole);
    expect(roleRepository.getByID).toHaveBeenCalledWith(analystRole.id);
    expect(roleRepository.updateByID).toHaveBeenCalledWith(analystRole.id, {
      name: "security-analyst",
      permissions: updatedRole.permissions,
    });
    expect(domainEvents.subjects()).toEqual(["role.updated"]);
    expect(domainEvents.eventsFor("role.updated")[0]).toMatchObject({
      subject: "role.updated",
      source: "role",
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        previous: analystRole,
        current: updatedRole,
      },
    });
  });

  it("does not emit role update events for unchanged roles", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.updateByID.mockResolvedValue({
      role: analystRole,
      permissionsChanged: false,
      affectedUserCount: 0,
      revokedSessionCount: 0,
    });

    await expect(
      service.updateByID({
        id: analystRole.id,
        role: {
          name: analystRole.name,
          permissions: analystRole.permissions,
        },
        eventContext,
      }),
    ).resolves.toEqual(analystRole);
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("returns null when updating a role that does not exist", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValueOnce(null);

    await expect(
      service.updateByID({
        id: analystRole.id,
        role: {
          name: "security-analyst",
          permissions: analystRole.permissions,
        },
      }),
    ).resolves.toBeNull();
    expect(roleRepository.updateByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("returns null when a role update loses a race with deletion", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValueOnce(analystRole);
    roleRepository.updateByID.mockResolvedValueOnce(null);

    await expect(
      service.updateByID({
        id: analystRole.id,
        role: {
          name: "security-analyst",
          permissions: analystRole.permissions,
        },
      }),
    ).resolves.toBeNull();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("maps duplicate role name updates to a conflict ApplicationError", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.updateByID.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );

    await expect(
      service.updateByID({
        id: analystRole.id,
        role: {
          name: BuiltInRoleName.Viewer,
          permissions: analystRole.permissions,
        },
      }),
    ).rejects.toMatchObject({
      code: "role.update_conflict",
      kind: "conflict",
      details: { roleId: analystRole.id, roleName: BuiltInRoleName.Viewer },
    } satisfies Partial<ApplicationError>);
  });

  it("maps role update failures to an unexpected ApplicationError", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValueOnce(analystRole);
    roleRepository.updateByID.mockRejectedValueOnce(new Error("db offline"));

    await expect(
      service.updateByID({
        id: analystRole.id,
        role: {
          name: "security-analyst",
          permissions: analystRole.permissions,
        },
      }),
    ).rejects.toMatchObject({
      code: "role.update_failed",
      kind: "unexpected",
      details: { roleId: analystRole.id },
    } satisfies Partial<ApplicationError>);
  });

  it("rejects attempts to modify built-in roles", async () => {
    const service = createService();

    await expect(
      service.updateByID({
        id: builtInRoleIds.viewer,
        role: {
          name: "updated-viewer",
          permissions: [],
        },
      }),
    ).rejects.toMatchObject({
      code: "role.protected_role",
      kind: "denied",
      details: { roleId: builtInRoleIds.viewer },
    } satisfies Partial<ApplicationError>);

    expect(roleRepository.updateByID).not.toHaveBeenCalled();
  });

  it("deletes a custom role", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.deleteByID.mockResolvedValue(analystRole);

    await expect(service.deleteByID(analystRole.id, eventContext)).resolves.toEqual(analystRole);
    expect(roleRepository.hasUsersWithRoleID).toHaveBeenCalledWith(analystRole.id);
    expect(domainEvents.subjects()).toEqual(["role.deleted"]);
    expect(domainEvents.eventsFor("role.deleted")[0]).toMatchObject({
      subject: "role.deleted",
      source: "role",
      actor: eventContext.actor,
      correlationId: eventContext.correlationId,
      data: {
        role: analystRole,
      },
    });
  });

  it("returns null when deleting a role that does not exist", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValueOnce(null);

    await expect(service.deleteByID(analystRole.id)).resolves.toBeNull();
    expect(roleRepository.hasUsersWithRoleID).not.toHaveBeenCalled();
    expect(roleRepository.deleteByID).not.toHaveBeenCalled();
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("returns null when a role delete loses a race with deletion", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValueOnce(analystRole);
    roleRepository.deleteByID.mockResolvedValueOnce(null);

    await expect(service.deleteByID(analystRole.id)).resolves.toBeNull();
    expect(roleRepository.hasUsersWithRoleID).toHaveBeenCalledWith(analystRole.id);
    expect(domainEvents.subjects()).toEqual([]);
  });

  it("rejects trying to delete a built-in role", async () => {
    const service = createService();

    await expect(service.deleteByID(builtInRoleIds.admin)).rejects.toMatchObject({
      code: "role.protected_role",
      kind: "denied",
      details: { roleId: builtInRoleIds.admin },
    } satisfies Partial<ApplicationError>);

    expect(roleRepository.deleteByID).not.toHaveBeenCalled();
  });

  it("rejects deleting a role that is still assigned to users", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.hasUsersWithRoleID.mockResolvedValue(true);

    await expect(service.deleteByID(analystRole.id)).rejects.toMatchObject({
      code: "role.assigned_to_users",
      kind: "conflict",
      details: { roleId: analystRole.id, roleName: analystRole.name },
    } satisfies Partial<ApplicationError>);

    expect(roleRepository.deleteByID).not.toHaveBeenCalled();
  });

  it("maps role delete failures to an unexpected ApplicationError", async () => {
    const service = createService();

    roleRepository.getByID.mockResolvedValueOnce(analystRole);
    roleRepository.deleteByID.mockRejectedValueOnce(new Error("db offline"));

    await expect(service.deleteByID(analystRole.id)).rejects.toMatchObject({
      code: "role.delete_failed",
      kind: "unexpected",
      details: { roleId: analystRole.id },
    } satisfies Partial<ApplicationError>);
  });
});
