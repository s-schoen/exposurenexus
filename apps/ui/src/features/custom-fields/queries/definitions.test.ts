import { keepPreviousData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
} from "@/features/custom-fields/queries/definitions.ts";
import { DEFAULT_QUERY_STALE_TIME } from "@/lib/query-client.ts";

describe("asset custom field queries", () => {
  it("creates list query options with the established cache policy", () => {
    const options = createListAssetCustomFieldDefinitionsQueryOptions();

    expect(options.queryKey).toEqual(["asset-custom-fields"]);
    expect(options.placeholderData).toBe(keepPreviousData);
    expect(options.staleTime).toBe(DEFAULT_QUERY_STALE_TIME);
  });

  it("creates definition detail query options", () => {
    const definitionId = "33d63e64-8f2b-4f88-b26f-fb090b4366ff";

    expect(createAssetCustomFieldDefinitionByIDQueryOptions(definitionId).queryKey).toEqual([
      "asset-custom-fields",
      definitionId,
    ]);
  });
});
