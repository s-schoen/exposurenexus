import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { describe, expect, it } from "vitest";

import { formatAssetCustomFieldValue } from "@/features/assets/lib/asset-custom-fields.ts";

import type { AssetCustomFieldValue } from "@exposurenexus/contracts/model/asset-custom-field";

const fieldId = "8f0365b2-1bbb-46e2-b1f4-06300ade23f3";
const selectOptions = [
  {
    id: "6b567696-6808-45be-ab67-a8683d98a138",
    fieldId,
    value: "production",
    label: "Production",
  },
];

describe("formatAssetCustomFieldValue", () => {
  it.each([
    ["missing", undefined, "None"],
    [
      "null text",
      {
        fieldId,
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: null,
      },
      "None",
    ],
    [
      "text",
      {
        fieldId,
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "Internet-facing",
      },
      "Internet-facing",
    ],
    [
      "numeric zero",
      {
        fieldId,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Number,
        value: 0,
      },
      "0",
    ],
    [
      "matched select",
      {
        fieldId,
        key: "deployment_tier",
        name: "Deployment tier",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "production",
        options: selectOptions,
      },
      "Production",
    ],
    [
      "unmatched select",
      {
        fieldId,
        key: "deployment_tier",
        name: "Deployment tier",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "retired",
        options: selectOptions,
      },
      "retired",
    ],
  ] as const satisfies ReadonlyArray<readonly [string, AssetCustomFieldValue | undefined, string]>)(
    "formats %s values",
    (_case, field, expected) => {
      expect(formatAssetCustomFieldValue(field)).toBe(expected);
    },
  );
});
