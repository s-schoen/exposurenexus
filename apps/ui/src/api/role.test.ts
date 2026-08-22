import {
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createListRolesQueryOptions,
  createRole,
  createRoleByIDQueryOptions,
  deleteRole,
  updateRole,
} from "@/api/role.ts";

import type { CreateRole, Role, UpdateRole } from "@exposurenexus/contracts/model/rbac";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: object, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function requestInit(): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1];
  if (!init) {
    throw new Error("fetch was not called");
  }

  return init;
}

function requestJsonBody(): unknown {
  return JSON.parse(requestInit().body as string);
}

function runQuery<T>(queryOptions: { queryFn?: unknown }): Promise<T> {
  const queryFn = queryOptions.queryFn as () => Promise<T>;

  return queryFn();
}

const roleId = builtInRoleIds.editor;
const role: Role = {
  id: roleId,
  name: "editor",
  permissions: [
    { resource: PermissionResource.User, verb: PermissionVerb.Read },
    { resource: PermissionResource.User, verb: PermissionVerb.Write },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("role api", () => {
  it("creates list query options and parses role lists", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [role],
        },
      }),
    );

    const queryOptions = createListRolesQueryOptions();
    const roles = await runQuery<Array<Role>>(queryOptions);

    expect(queryOptions.queryKey).toEqual(["roles"]);
    expect(roles).toEqual([role]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/roles",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("rejects malformed role replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          items: [
            {
              ...role,
              permissions: [
                {
                  resource: "billing",
                  verb: PermissionVerb.Read,
                },
              ],
            },
          ],
        },
      }),
    );

    await expect(runQuery<Array<Role>>(createListRolesQueryOptions())).rejects.toThrow();
  });

  it("creates detail query options and parses role detail replies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: role,
      }),
    );

    const queryOptions = createRoleByIDQueryOptions(roleId);
    const result = await runQuery<Role>(queryOptions);

    expect(queryOptions.queryKey).toEqual(["roles", roleId]);
    expect(result).toEqual(role);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/roles/${roleId}`,
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("creates roles with a JSON request body", async () => {
    const payload: CreateRole = {
      name: "security-analyst",
      permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
    };
    const createdRole = {
      id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
      ...payload,
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: createdRole,
      }),
    );

    await expect(createRole(payload)).resolves.toEqual(createdRole);

    const headers = requestInit().headers as Headers;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/roles",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestJsonBody()).toEqual(payload);
  });

  it("updates roles with a JSON request body", async () => {
    const payload: UpdateRole = {
      name: "security-editor",
      permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
    };
    const updatedRole = {
      ...role,
      ...payload,
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: updatedRole,
      }),
    );

    await expect(updateRole(roleId, payload)).resolves.toEqual(updatedRole);

    const headers = requestInit().headers as Headers;
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/roles/${roleId}`,
      expect.objectContaining({
        credentials: "include",
        method: "PUT",
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(requestJsonBody()).toEqual(payload);
  });

  it("deletes roles", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: role,
      }),
    );

    await expect(deleteRole(roleId)).resolves.toEqual(role);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/roles/${roleId}`,
      expect.objectContaining({
        credentials: "include",
        method: "DELETE",
      }),
    );
  });

  it("throws API errors from create role requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "role already exists",
        },
        { status: 409 },
      ),
    );

    await expect(
      createRole({
        name: "editor",
        permissions: [],
      }),
    ).rejects.toThrow("role already exists");
  });

  it("throws API errors from role requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "Role request failed",
          reason: "role is protected",
        },
        { status: 400 },
      ),
    );

    await expect(deleteRole(roleId)).rejects.toThrow("Role request failed");
  });
});
