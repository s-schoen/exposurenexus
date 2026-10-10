import { PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRole,
  deleteRole,
  getRoleByID,
  listRoles,
  updateRole,
} from "@/features/roles/api/roles.ts";
import { APIError } from "@/lib/api-client.ts";
import { CUSTOM_AUDITOR_ROLE } from "@/mocks/fixtures/index.ts";
import { mockApiError, mockApiReply } from "@/test/msw.ts";

// Happy-path requests and bodies are covered by src/mocks/handlers/handlers.test.ts, whose
// handlers validate bodies with the contracts schemas. This covers error and reply handling.

const { id } = CUSTOM_AUDITOR_ROLE;
const payload = { name: "auditor", permissions: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("role api", () => {
  it.each([
    ["list", "get", "/roles", () => listRoles()],
    ["get", "get", "/roles/:id", () => getRoleByID(id)],
    ["create", "post", "/roles", () => createRole(payload)],
    ["update", "put", "/roles/:id", () => updateRole(id, payload)],
    ["delete", "delete", "/roles/:id", () => deleteRole(id)],
  ] as const)("turns %s error replies into APIErrors", async (_name, method, path, call) => {
    mockApiError(method, path, 422, "Role endpoint rejected the request", "role-reason");

    const request = call();
    await expect(request).rejects.toBeInstanceOf(APIError);
    await expect(request).rejects.toMatchObject({
      statusCode: 422,
      message: "Role endpoint rejected the request",
      reason: "role-reason",
    });
  });

  it("rejects replies that break the role contract", async () => {
    mockApiReply("get", "/roles", {
      data: {
        items: [
          {
            ...CUSTOM_AUDITOR_ROLE,
            permissions: [{ resource: "billing", verb: PermissionVerb.Read }],
          },
        ],
      },
    });

    await expect(listRoles()).rejects.toThrow();
  });
});
