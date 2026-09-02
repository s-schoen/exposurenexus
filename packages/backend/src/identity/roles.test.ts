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

function createService() {
  return createRoles({ roleRepository, logger });
}

describe("identity roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleRepository.hasUsersWithRoleID.mockResolvedValue(false);
  });

  it("preserves role query and name resolution behavior", async () => {
    roleRepository.list.mockResolvedValue([adminRole, viewerRole]);
    roleRepository.getByID.mockResolvedValue(viewerRole);
    roleRepository.getByNames.mockResolvedValue([viewerRole, adminRole]);
    roleRepository.getByIDs.mockResolvedValue([adminRole, viewerRole]);
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
    roleRepository.getByID.mockResolvedValue(null);

    await expect(createService().getByID(analystRole.id)).resolves.toBeNull();
  });

  it("rejects unknown role ids", async () => {
    const unknownRoleId = "0671d03d-57f1-49c8-8f62-5de6ed0924db";
    roleRepository.getByIDs.mockResolvedValue([viewerRole]);

    await expect(
      createService().requireRoleNamesFromIds([builtInRoleIds.viewer, unknownRoleId]),
    ).rejects.toMatchObject({
      code: "role.unknown_ids",
      kind: "validation",
      details: { roleIds: [unknownRoleId] },
    } satisfies Partial<ApplicationError>);
  });

  it.each([
    ["listAll", "list", "role.list_failed"],
    ["getByID", "getByID", "role.get_failed"],
    ["getByNames", "getByNames", "role.get_by_names_failed"],
    ["resolveRoleIdsFromNames", "getByNames", "role.resolve_ids_failed"],
    ["requireRoleNamesFromIds", "getByIDs", "role.resolve_names_failed"],
  ] as const)("maps %s persistence failures", async (method, repositoryMethod, code) => {
    roleRepository[repositoryMethod].mockRejectedValue(new Error("db offline"));
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
    roleRepository.create.mockResolvedValue(createdRole);

    await expect(createService().create({ role, performedBy })).resolves.toEqual({
      current: createdRole,
      performedBy,
    });
    expect(roleRepository.create).toHaveBeenCalledWith(role);
  });

  it("maps duplicate role creation to a conflict", async () => {
    roleRepository.create.mockRejectedValue(
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
    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.updateByID.mockResolvedValue({
      role: updatedRole,
      permissionsChanged: true,
      affectedUserCount: 2,
      revokedSessionCount: 3,
    });

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
    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.updateByID.mockResolvedValue({
      role: analystRole,
      permissionsChanged: false,
      affectedUserCount: 0,
      revokedSessionCount: 0,
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
    roleRepository.getByID.mockResolvedValueOnce(null).mockResolvedValueOnce(analystRole);
    roleRepository.updateByID.mockResolvedValue(null);
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
    expect(roleRepository.updateByID).not.toHaveBeenCalled();
    expect(roleRepository.deleteByID).not.toHaveBeenCalled();
  });

  it("returns a safe deletion outcome", async () => {
    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.deleteByID.mockResolvedValue(analystRole);

    await expect(createService().deleteByID({ id: analystRole.id, performedBy })).resolves.toEqual({
      previous: analystRole,
      performedBy,
    });
    expect(roleRepository.hasUsersWithRoleID).toHaveBeenCalledWith(analystRole.id);
  });

  it("rejects deleting roles assigned to users", async () => {
    roleRepository.getByID.mockResolvedValue(analystRole);
    roleRepository.hasUsersWithRoleID.mockResolvedValue(true);

    await expect(
      createService().deleteByID({ id: analystRole.id, performedBy }),
    ).rejects.toMatchObject({
      code: "role.assigned_to_users",
      kind: "conflict",
      details: { roleId: analystRole.id, roleName: analystRole.name },
    } satisfies Partial<ApplicationError>);
    expect(roleRepository.deleteByID).not.toHaveBeenCalled();
  });
});
