import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getAssetCustomFieldColumnId } from "@/features/assets/components/asset-table/columns.tsx";
import {
  createAssetTableFilterState,
  createAssetListOptions,
  createAssetListOptionsFromSearch,
  createAssetTableSearchParams,
  useAssetTableSearchState,
  validateAssetTableSearch,
} from "@/features/assets/hooks/use-asset-table-search-state.ts";
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/test/fixtures.ts";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

describe("useAssetTableSearchState", () => {
  afterEach(() => {
    cleanup();
    mocks.navigate.mockReset();
  });

  it("validates the static asset table filter search param", () => {
    expect(validateAssetTableSearch({ filter: "api", selected: 42 })).toEqual({
      filter: "api",
    });
    expect(validateAssetTableSearch({ filter: 42 })).toEqual({
      filter: undefined,
    });
  });

  it("validates core asset filter search params", () => {
    expect(
      validateAssetTableSearch({
        assetType: "host,software",
        assetEnvironment: "production",
        assetLifecycleState: "archived",
        assetOwnerId: "none",
      }),
    ).toEqual({
      filter: undefined,
      assetType: "host,software",
      assetEnvironment: "production",
      assetLifecycleState: "archived",
      assetOwnerId: "none",
    });

    expect(
      validateAssetTableSearch({
        assetType: 42,
        assetEnvironment: ["production", 42],
        assetLifecycleState: ["archived"],
        assetOwnerId: null,
      }),
    ).toEqual({
      filter: undefined,
      assetEnvironment: "production",
      assetLifecycleState: "archived",
    });
  });

  it("parses dynamic top-level custom field params into table filters", () => {
    expect(
      createAssetTableFilterState(
        {
          category: "internet",
          deployment_tier: "production,staging",
          filter: "api",
          priority: "3",
        },
        ASSET_CUSTOM_FIELD_FIXTURES,
      ),
    ).toEqual({
      globalFilter: "api",
      selectFilters: {
        [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
          "production",
          "staging",
        ],
      },
      textFilters: {
        [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: "internet",
      },
      numberFilters: {
        [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]: "3",
      },
    });
  });

  it("parses core asset filter params alongside custom field filters", () => {
    expect(
      createAssetTableFilterState(
        {
          assetType: "host,software",
          assetEnvironment: "production",
          assetLifecycleState: "archived",
          assetOwnerId: "none",
        },
        ASSET_CUSTOM_FIELD_FIXTURES,
      ),
    ).toMatchObject({
      selectFilters: {
        type: ["host", "software"],
        environment: ["production"],
        lifecycleState: ["archived"],
        ownerId: ["none"],
      },
    });
  });

  it("serializes dynamic custom field filter params and clears inactive ones", () => {
    expect(
      createAssetTableSearchParams(
        {
          globalFilter: "edge",
          selectFilters: {
            [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
              "production",
              "staging",
            ],
          },
          textFilters: {
            [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: "internet",
          },
          numberFilters: {},
        },
        ASSET_CUSTOM_FIELD_FIXTURES,
      ),
    ).toEqual({
      category: "internet",
      deployment_tier: "production,staging",
      filter: "edge",
      priority: undefined,
    });
  });

  it("serializes core asset filters without colliding with custom field keys", () => {
    expect(
      createAssetTableSearchParams(
        {
          globalFilter: "edge",
          selectFilters: {
            type: ["host"],
            environment: ["production"],
            lifecycleState: ["archived"],
            ownerId: ["none"],
          },
          textFilters: {},
          numberFilters: {},
        },
        ASSET_CUSTOM_FIELD_FIXTURES,
      ),
    ).toMatchObject({
      assetType: "host",
      assetEnvironment: "production",
      assetLifecycleState: "archived",
      assetOwnerId: "none",
    });
  });

  it("maps active asset filters to API list options and omits empty filters", () => {
    expect(
      createAssetListOptions({
        globalFilter: "  api  ",
        selectFilters: {
          type: ["host", "software"],
          environment: ["production"],
          lifecycleState: ["archived"],
          ownerId: ["none"],
        },
        textFilters: {},
        numberFilters: {},
      }),
    ).toEqual({
      filter: "api",
      assetType: ["host", "software"],
      assetEnvironment: ["production"],
      assetLifecycleState: ["archived"],
      assetOwnerId: ["none"],
    });

    expect(
      createAssetListOptions({
        globalFilter: "  ",
        selectFilters: {},
        textFilters: {},
        numberFilters: {},
      }),
    ).toBeUndefined();
    expect(createAssetListOptions(undefined)).toBeUndefined();
  });

  it("maps route search and custom field definitions to API list options", () => {
    expect(
      createAssetListOptionsFromSearch(
        {
          filter: "  api  ",
          assetType: "host,software",
          assetEnvironment: "production",
          assetLifecycleState: "archived",
          assetOwnerId: "none",
          category: "internet",
          priority: "3",
          deployment_tier: "production,staging",
        },
        ASSET_CUSTOM_FIELD_FIXTURES,
      ),
    ).toEqual({
      filter: "api",
      assetType: ["host", "software"],
      assetEnvironment: ["production"],
      assetLifecycleState: ["archived"],
      assetOwnerId: ["none"],
    });
  });

  it("updates the asset route search state", () => {
    const { result } = renderHook(() =>
      useAssetTableSearchState({
        search: {},
        customFieldDefinitions: ASSET_CUSTOM_FIELD_FIXTURES,
      }),
    );

    act(() => {
      result.current.onFilterStateChange({
        globalFilter: "edge",
        selectFilters: {
          [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
            "production",
            "staging",
          ],
        },
        textFilters: {
          [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: "internet",
        },
        numberFilters: {
          [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]: "3",
        },
      });
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/assets",
      replace: true,
      search: expect.any(Function),
    });

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(
      search({
        category: "old",
        filter: "old",
        assetType: "host",
        assetEnvironment: "production",
        assetLifecycleState: "active",
        assetOwnerId: "owner-1",
        selected: "asset-1",
      }),
    ).toEqual({
      category: "internet",
      deployment_tier: "production,staging",
      filter: "edge",
      assetType: undefined,
      assetEnvironment: undefined,
      assetLifecycleState: undefined,
      assetOwnerId: undefined,
      priority: "3",
      selected: "asset-1",
    });
  });
});
