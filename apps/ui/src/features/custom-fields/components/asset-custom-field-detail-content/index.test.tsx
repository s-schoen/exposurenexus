import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { composeStories } from "@storybook/react-vite";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatDefaultValue,
  formatOptionCount,
  formatTypeLabel,
  summarizeCustomField,
} from "@/features/custom-fields/components/asset-custom-field-detail-content/helpers.ts";
import * as stories from "@/features/custom-fields/components/asset-custom-field-detail-content/index.stories";
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/test/fixtures.ts";

import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

type TextField = Extract<AssetCustomFieldDefinition, { type: AssetCustomFieldType.Text }>;
type NumberField = Extract<AssetCustomFieldDefinition, { type: AssetCustomFieldType.Number }>;
type SelectField = Extract<AssetCustomFieldDefinition, { type: AssetCustomFieldType.Select }>;

const textField = ASSET_CUSTOM_FIELD_FIXTURES.find(
  (field): field is TextField => field.type === AssetCustomFieldType.Text,
);
const numberField = ASSET_CUSTOM_FIELD_FIXTURES.find(
  (field): field is NumberField => field.type === AssetCustomFieldType.Number,
);
const selectField = ASSET_CUSTOM_FIELD_FIXTURES.find(
  (field): field is SelectField => field.type === AssetCustomFieldType.Select,
);

if (!textField || !numberField || !selectField) {
  throw new Error("Expected custom-field fixtures for every type");
}

const { Default } = composeStories(stories);
afterEach(cleanup);
it("renders resolved data without a query provider", () => {
  render(<Default />);
  expect(screen.getAllByText(Default.args.field!.name).length).toBeGreaterThan(0);
});

describe("asset custom-field detail helpers", () => {
  it.each([
    [AssetCustomFieldType.Text, "Text"],
    [AssetCustomFieldType.Number, "Number"],
    [AssetCustomFieldType.Select, "Select"],
  ])("formats the %s type label", (type, label) => {
    expect(formatTypeLabel(type)).toBe(label);
  });

  it.each([
    ["a text value", { ...textField, defaultValue: "Security" }],
    ["a numeric zero", { ...numberField, defaultValue: 0 }],
    ["a null default", { ...textField, defaultValue: null }],
  ])("formats %s defaults", (_description, field) => {
    expect(formatDefaultValue(field)).toBe(
      field.defaultValue === null ? "None" : String(field.defaultValue),
    );
  });

  it("resolves a select default to its label and falls back to an unmatched value", () => {
    expect(formatDefaultValue(selectField)).toBe("Production");
    expect(formatDefaultValue({ ...selectField, defaultValue: "retired" })).toBe("retired");
  });

  it.each([
    ["text", textField, "N/A"],
    ["number", numberField, "N/A"],
    ["one-option select", { ...selectField, options: selectField.options.slice(0, 1) }, "1 option"],
    ["two-option select", selectField, "2 options"],
  ])("formats the %s option count", (_description, field, count) => {
    expect(formatOptionCount(field)).toBe(count);
  });

  it("builds the complete summary used by the detail view", () => {
    expect(summarizeCustomField(selectField)).toEqual({
      typeLabel: "Select",
      defaultValue: "Production",
      optionCount: "2 options",
    });
  });
});
