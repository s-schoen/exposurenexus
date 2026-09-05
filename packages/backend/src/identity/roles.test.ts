import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
  type Role,
} from "@exposurenexus/contracts/model/rbac";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRoles } from "./roles.js";

import type { ApplicationError } from "../application-error.js";

const performedBy = "95d5909c-a9ab-4350-a515-4b89eb1065ae";

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

const rolePersistence = {
  listRoles: vi.fn(),
  getRoleByID: vi.fn(),
  getRolesByIDs: vi.fn(),
  getRolesByNames: vi.fn(),
  insertRole: vi.fn(),
  updateRole: vi.fn(),
  hasUsersWithRoleID: vi.fn(),
  deleteRole: vi.fn(),
};
const sessionPersistence = {
  deleteSessionsByUserIDs: vi.fn(),
};
const database = {
  transaction: vi.fn(),
};
const transaction = {
  execute: vi.fn(),
};
const logger = pino({ enabled: false });

function createService() {
  return createRoles({
    database: database as never,
    rolePersistence,
    sessionPersistence,
    logger,
  });
}

describe("identity roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.transaction.mockReturnValue(transaction);
    transaction.execute.mockImplementation(
      async (callback: (executor: typeof database) => unknown) => await callback(database),
    );
    rolePersistence.hasUsersWithRoleID.mockResolvedValue(false);
    sessionPersistence.deleteSessionsByUserIDs.mockResolvedValue(0);
  });

  it("preserves role query and name resolution behavior", async () => {
    rolePersistence.listRoles.mockResolvedValue([adminRole, viewerRole]);
    rolePersistence.getRoleByID.mockResolvedValue(viewerRole);
    rolePersistence.getRolesByNames.mockResolvedValue([viewerRole, adminRole]);
    rolePersistence.getRolesByIDs.mockResolvedValue([adminRole, viewerRole]);
    const roles = createService();

    await expect(roles.listAll()).resolves.toEqual([adminRole, viewerRole]);
    await expect(roles.getByID(viewerRole.id)).resolves.toEqual(viewerRole);
    await expect(
      roles.getByNames([BuiltInRoleName.Viewer, BuiltInRoleName.Admin, BuiltInRoleName.Viewer]),
    ).resolves.toEqual([viewerRole, adminRole]);
    await expect(
      roles.resolveRoleIdsFromNames([BuiltInRoleName.Viewer, BuiltInRoleName.Admin]),
    ).resolves.toEqual([builtInRoleIds.viewer, builtInRoleIds.admin]);
    await expect(
      roles.requireRoleNamesFromIds([
        builtInRoleIds.admin,
        builtInRoleIds.viewer,
        builtInRoleIds.admin,
      ]),
    ).resolves.toEqual([BuiltInRoleName.Admin, BuiltInRoleName.Viewer]);
  });

  it("returns null for an unknown role", async () => {
    rolePersistence.getRoleByID.mockResolvedValue(null);

    await expect(createService().getByID(analystRole.id)).resolves.toBeNull();
  });

  it("rejects unknown role ids", async () => {
    const unknownRoleId = "0671d03d-57f1-49c8-8f62-5de6ed0924db";
    rolePersistence.getRolesByIDs.mockResolvedValue([viewerRole]);

    await expect(
      createService().requireRoleNamesFromIds([builtInRoleIds.viewer, unknownRoleId]),
    ).rejects.toMatchObject({
      code: "role.unknown_ids",
      kind: "validation",
      details: { roleIds: [unknownRoleId] },
    } satisfies Partial<ApplicationError>);
  });

  it.each([
    ["listAll", "listRoles", "role.list_failed"],
    ["getByID", "getRoleByID", "role.get_failed"],
    ["getByNames", "getRolesByNames", "role.get_by_names_failed"],
    ["resolveRoleIdsFromNames", "getRolesByNames", "role.resolve_ids_failed"],
    ["requireRoleNamesFromIds", "getRolesByIDs", "role.resolve_names_failed"],
  ] as const)("maps %s persistence failures", async (method, persistenceMethod, code) => {
    rolePersistence[persistenceMethod].mockRejectedValue(new Error("db offline"));
    const roles = createService();
    const argument = method === "getByID" ? analystRole.id : [analystRole.id];

    await expect(
      (roles[method] as (value?: never) => Promise<unknown>)(argument as never),
    ).rejects.toMatchObject({
      code,
      kind: "unexpected",
    });
  });

  it("returns a safe creation outcome", async () => {
    const role = {
      name: "security-analyst",
      permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
    };
    const createdRole = { ...analystRole, ...role };
    rolePersistence.insertRole.mockResolvedValue(createdRole);

    await expect(
      createService().create({ role: { ...role, name: `  ${role.name}  ` }, performedBy }),
    ).resolves.toEqual({
      current: createdRole,
      performedBy,
    });
    expect(rolePersistence.insertRole).toHaveBeenCalledWith(expect.anything(), role);
  });

  it("maps duplicate role creation to a conflict", async () => {
    rolePersistence.insertRole.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" }),
    );

    await expect(
      createService().create({
        role: { name: BuiltInRoleName.Viewer, permissions: [] },
        performedBy,
      }),
    ).rejects.toMatchObject({
      code: "role.create_conflict",
      kind: "conflict",
      details: { roleName: BuiltInRoleName.Viewer },
    } satisfies Partial<ApplicationError>);
  });

  it("returns update facts and preserves session revocation behavior", async () => {
    const updatedRole: Role = {
      ...analystRole,
      permissions: [
        ...analystRole.permissions,
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      ],
    };
    rolePersistence.updateRole.mockResolvedValue({
      previous: analystRole,
      role: updatedRole,
      permissionsChanged: true,
      affectedUserIds: ["first-user", "second-user"],
    });
    sessionPersistence.deleteSessionsByUserIDs.mockResolvedValue(3);

    await expect(
      createService().updateByID({
        id: analystRole.id,
        role: { name: updatedRole.name, permissions: updatedRole.permissions },
        performedBy,
      }),
    ).resolves.toEqual({
      previous: analystRole,
      current: updatedRole,
      changed: true,
      performedBy,
    });
  });

  it("marks an unchanged role update without losing its snapshots", async () => {
    rolePersistence.updateRole.mockResolvedValue({
      previous: analystRole,
      role: analystRole,
      permissionsChanged: false,
      affectedUserIds: [],
    });

    await expect(
      createService().updateByID({
        id: analystRole.id,
        role: { name: analystRole.name, permissions: analystRole.permissions },
        performedBy,
      }),
    ).resolves.toEqual({
      previous: analystRole,
      current: analystRole,
      changed: false,
      performedBy,
    });
  });

  it("returns null when an update target is missing or loses a deletion race", async () => {
    rolePersistence.updateRole.mockResolvedValue(null);
    const roles = createService();
    const command = {
      id: analystRole.id,
      role: { name: analystRole.name, permissions: analystRole.permissions },
      performedBy,
    };

    await expect(roles.updateByID(command)).resolves.toBeNull();
    await expect(roles.updateByID(command)).resolves.toBeNull();
  });

  it("protects built-in roles from updates and deletion", async () => {
    const roles = createService();

    await expect(
      roles.updateByID({
        id: builtInRoleIds.viewer,
        role: { name: "updated-viewer", permissions: [] },
        performedBy,
      }),
    ).rejects.toMatchObject({ code: "role.protected_role", kind: "denied" });
    await expect(roles.deleteByID({ id: builtInRoleIds.admin, performedBy })).rejects.toMatchObject(
      { code: "role.protected_role", kind: "denied" },
    );
    expect(rolePersistence.updateRole).not.toHaveBeenCalled();
    expect(rolePersistence.deleteRole).not.toHaveBeenCalled();
  });

  it("returns a safe deletion outcome", async () => {
    rolePersistence.getRoleByID.mockResolvedValue(analystRole);
    rolePersistence.deleteRole.mockResolvedValue(analystRole);

    await expect(createService().deleteByID({ id: analystRole.id, performedBy })).resolves.toEqual({
      previous: analystRole,
      performedBy,
    });
    expect(rolePersistence.hasUsersWithRoleID).toHaveBeenCalledWith(
      expect.anything(),
      analystRole.id,
    );
  });

  it("rejects deleting roles assigned to users", async () => {
    rolePersistence.getRoleByID.mockResolvedValue(analystRole);
    rolePersistence.hasUsersWithRoleID.mockResolvedValue(true);

    await expect(
      createService().deleteByID({ id: analystRole.id, performedBy }),
    ).rejects.toMatchObject({
      code: "role.assigned_to_users",
      kind: "conflict",
      details: { roleId: analystRole.id, roleName: analystRole.name },
    } satisfies Partial<ApplicationError>);
    expect(rolePersistence.deleteRole).not.toHaveBeenCalled();
  });
});
