import { AssetType } from "@exposurenexus/types/model/asset";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  db: {},
  logger: {},
  pool: {},
}));

import {
  createAssetRepository,
  createFindingRepository,
  createRoleRepository,
  createUserRoleRepository,
  createVulnerabilityRepository,
} from "./index.js";

describe("repository factories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an asset repository bound to the injected db", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn();
    const query = {
      where: vi.fn(),
      orderBy,
      executeTakeFirst: execute,
      execute,
    };
    query.where.mockReturnValue(query);
    orderBy.mockReturnValue(query);
    const selectAll = vi.fn().mockReturnValue(query);
    const selectFrom = vi.fn().mockReturnValue({ selectAll });
    const db = { selectFrom };

    const repository = createAssetRepository(db as never);

    await repository.getByDisplayName("api.exposurenexus.local", AssetType.Host);

    expect(selectFrom).toHaveBeenCalledWith("asset");
    expect(query.where).toHaveBeenNthCalledWith(1, "displayName", "=", "api.exposurenexus.local");
    expect(query.where).toHaveBeenNthCalledWith(2, "type", "=", AssetType.Host);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("creates the final finding repository surface", () => {
    expect(Object.keys(createFindingRepository({} as never)).sort()).toEqual(
      [
        "countBy",
        "create",
        "createManual",
        "deleteByID",
        "getByID",
        "getProjectedByID",
        "linkVulnerability",
        "list",
        "listProjected",
        "unlinkVulnerability",
        "updateByID",
      ].sort(),
    );
  });

  it("creates a vulnerability catalog repository bound to the injected db", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const selectAll = vi.fn().mockReturnValue({ execute });
    const selectFrom = vi.fn().mockReturnValue({ selectAll });
    const db = { selectFrom };

    const repository = createVulnerabilityRepository(db as never);

    await repository.list();

    expect(selectFrom).toHaveBeenCalledWith("vulnerability");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("keeps role persistence and user permission lookup as separate repository surfaces", () => {
    expect(Object.keys(createRoleRepository({} as never)).sort()).toEqual(
      [
        "create",
        "deleteByID",
        "getByID",
        "getByIDs",
        "getByNames",
        "hasUsersWithRoleID",
        "list",
        "updateByID",
      ].sort(),
    );
    expect(Object.keys(createUserRoleRepository({} as never))).toEqual(["listPermissionsByUserID"]);
  });
});
