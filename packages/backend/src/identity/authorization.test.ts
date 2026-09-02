import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthorization } from "./authorization.js";

import type { ApplicationError } from "../application-error.js";
import type { Logger } from "pino";

const userId = "a7d3ef96-d3b4-48bb-8386-681eb3be7b12";
const authorizationRepository = {
  listPermissionsByUserID: vi.fn(),
};
const logger = {
  error: vi.fn(),
} as unknown as Logger;

function createService() {
  return createAuthorization({ authorizationRepository, logger });
}

describe("identity authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true only when every requested permission is assigned", async () => {
    authorizationRepository.listPermissionsByUserID.mockResolvedValue([
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
    ]);

    const authorization = createService();

    await expect(
      authorization.userHasPermission(userId, {
        [PermissionResource.Asset]: [PermissionVerb.Read, PermissionVerb.Write],
        [PermissionResource.Finding]: [PermissionVerb.Read],
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.userHasPermission(userId, {
        [PermissionResource.Asset]: [PermissionVerb.Delete],
      }),
    ).resolves.toBe(false);
  });

  it("returns false when the user has no assigned permissions", async () => {
    authorizationRepository.listPermissionsByUserID.mockResolvedValue([]);

    await expect(
      createService().userHasPermission(userId, {
        [PermissionResource.Asset]: [PermissionVerb.Read],
      }),
    ).resolves.toBe(false);
  });

  it("preserves permission lookup error identity", async () => {
    authorizationRepository.listPermissionsByUserID.mockRejectedValue(new Error("db offline"));

    await expect(
      createService().userHasPermission(userId, {
        [PermissionResource.Asset]: [PermissionVerb.Read],
      }),
    ).rejects.toMatchObject({
      code: "auth.permission_check_failed",
      kind: "unexpected",
      details: { userId },
    } satisfies Partial<ApplicationError>);
  });
});
