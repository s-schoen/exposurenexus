import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
  createListAssetsQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
} from "@/features/assets/queries/assets.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

describe("asset queries", () => {
  it("creates the default asset list query with the established cache policy", () => {
    const options = createListAssetsQueryOptions();

    expect(options.queryKey).toEqual(["assets"]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });

  it("shares serialized filters between the asset list URL and query key", () => {
    const options = createListAssetsQueryOptions({
      filter: "  api.example.com  ",
      assetType: [AssetType.Host, AssetType.Software],
      assetEnvironment: [AssetEnvironment.Production],
      assetLifecycleState: [AssetLifecycleState.Archived],
      assetOwnerId: ["owner-1", "none"],
    });

    expect(options.queryKey).toEqual([
      "assets",
      "filter=api.example.com&assetType=host%2Csoftware&assetEnvironment=production&assetLifecycleState=archived&assetOwnerId=owner-1%2Cnone",
    ]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });

  it("creates custom-field asset list query options with the established cache policy", () => {
    const options = createListAssetsWithCustomFieldsQueryOptions({
      filter: "api.example.com",
      assetEnvironment: [AssetEnvironment.Production],
    });

    expect(options.queryKey).toEqual([
      "assets",
      "with-custom-fields",
      "filter=api.example.com&assetEnvironment=production",
    ]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });

  it("creates asset detail query options without placeholder data", () => {
    const assetId = "0bb9b410-7763-4e7a-9942-b752367fd63d";
    const options = createAssetByIDQueryOptions(assetId);

    expect(options.queryKey).toEqual(["assets", assetId]);
    expect(options.placeholderData).toBeUndefined();
  });

  it("creates asset custom-field value and availability query options", () => {
    const assetId = "0bb9b410-7763-4e7a-9942-b752367fd63d";

    const values = createAssetCustomFieldValuesQueryOptions(assetId);
    const available = createAvailableAssetCustomFieldDefinitionsQueryOptions(assetId);

    expect(values.queryKey).toEqual(["assets", assetId, "custom-fields"]);
    expect(values.placeholderData).toBe(keepPreviousData);
    expect(values.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
    expect(available.queryKey).toEqual(["assets", assetId, "custom-fields", "available"]);
    expect(available.placeholderData).toBe(keepPreviousData);
    expect(available.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });
});
