import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { describe, expect, it } from "vitest";

import { assetCustomFieldFormSchema } from "@/features/custom-fields/components/asset-custom-field-form.tsx";

import type { AssetCustomFieldFormValues } from "@/features/custom-fields/components/asset-custom-field-form.tsx";

// The form's submit validation. Page flows live in pages/custom-fields.app.test.tsx; payload
// mapping and the shared definition rules in asset-custom-field-rule-validation.test.ts.

const selectValues: AssetCustomFieldFormValues = {
  name: "Exposure",
  key: "exposure",
  type: AssetCustomFieldType.Select,
  required: false,
  defaultValue: "",
  options: [
    { value: "internal", label: "Internal" },
    { value: "public", label: "Public" },
  ],
};

function issues(values: Partial<AssetCustomFieldFormValues>) {
  const result = assetCustomFieldFormSchema.safeParse({ ...selectValues, ...values });
  return (result.error?.issues ?? []).map(({ path, message }) => ({ path, message }));
}

describe("asset custom field form schema", () => {
  it("accepts a select with complete options and a matching default", () => {
    expect(issues({})).toEqual([]);
    expect(issues({ required: true, defaultValue: " public " })).toEqual([]);
  });

  it("requires at least one non-blank select option", () => {
    expect(issues({ options: [{ value: " ", label: "" }] })).toEqual([
      { path: ["options"], message: "Add at least one option" },
      { path: ["options"], message: "Enter an option value" },
      { path: ["options"], message: "Enter an option label" },
    ]);
  });

  it("flags the blank half of each incomplete option on the options field", () => {
    expect(
      issues({
        options: [
          { value: "internal", label: " " },
          { value: "", label: "Public" },
        ],
      }),
    ).toEqual([
      { path: ["options"], message: "Enter an option label" },
      { path: ["options"], message: "Enter an option value" },
    ]);
  });

  it("applies the shared rules to select options and defaults", () => {
    expect(
      issues({
        options: [
          { value: "internal", label: "Internal" },
          { value: " internal ", label: "Also internal" },
        ],
      }),
    ).toEqual([{ path: ["options"], message: "Option values must be unique" }]);
    expect(issues({ defaultValue: "restricted" })).toEqual([
      { path: ["defaultValue"], message: "Select a default from the available options" },
    ]);
  });

  it("ignores options for text and number fields", () => {
    const blankOptions = [{ value: "", label: "" }];

    expect(issues({ type: AssetCustomFieldType.Text, options: blankOptions })).toEqual([]);
    expect(
      issues({ type: AssetCustomFieldType.Number, defaultValue: "0", options: blankOptions }),
    ).toEqual([]);
  });

  it("rejects number defaults that aren't finite numbers", () => {
    expect(
      issues({ type: AssetCustomFieldType.Number, defaultValue: "1e999", options: [] }),
    ).toContainEqual({ path: ["defaultValue"], message: "Enter a valid number" });
    expect(
      issues({ type: AssetCustomFieldType.Number, defaultValue: "three", options: [] }),
    ).toContainEqual({ path: ["defaultValue"], message: "Enter a valid number" });
  });
});
