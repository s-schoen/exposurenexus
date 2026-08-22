import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts";
import {
  AssetCustomFieldForm,
  assetCustomFieldFormSchema,
  mapAssetCustomFieldDefinitionToFormValues,
  mapAssetCustomFieldFormValues,
  mapUpdateAssetCustomFieldFormValues,
} from "@/components/asset-custom-field-form";
import * as stories from "@/components/asset-custom-field-form.stories";
import { validateAssetCustomFieldFormRuleValues } from "@/components/asset-custom-field-rule-validation.ts";

import type { AssetCustomFieldFormValues } from "@/components/asset-custom-field-form";

const { CreateNumber, CreateSelect, CreateText, EditSelect } = composeStories(stories);

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
HTMLElement.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
});

function getInputByLabel(label: RegExp) {
  const element = screen.getByLabelText(label);

  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Expected input element");
  }

  return element;
}

describe("AssetCustomFieldForm", () => {
  it("renders create text field inputs", () => {
    render(<CreateText />);

    expect(screen.getByLabelText(/^name$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^key$/i)).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /type/i })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /required/i })).toBeTruthy();
    expect(screen.getByLabelText(/default value/i)).toBeTruthy();
    expect(screen.getByText(/cannot recreate core asset metadata/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /create custom field/i })).toBeTruthy();
  });

  it("renders number defaults", () => {
    render(<CreateNumber />);

    expect(getInputByLabel(/^name$/i).value).toBe("Priority");
    expect(getInputByLabel(/^key$/i).value).toBe("priority");
    expect(getInputByLabel(/default value/i).value).toBe("3");
  });

  it("renders select options in create and edit mode", () => {
    render(<CreateSelect />);

    expect(screen.getByLabelText(/option 1 value/i)).toBeTruthy();
    expect(screen.getByLabelText(/option 1 label/i)).toBeTruthy();
    expect(getInputByLabel(/option 1 value/i).value).toBe("production");
    expect(getInputByLabel(/option 2 label/i).value).toBe("Staging");

    cleanup();
    render(<EditSelect />);

    expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy();
    expect(getInputByLabel(/option 1 label/i).value).toBe("Production");
  });

  it("submits entered text field values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const values: AssetCustomFieldFormValues = {
      name: "Category",
      key: "category",
      type: AssetCustomFieldType.Text,
      required: false,
      defaultValue: "",
      options: [{ value: "", label: "" }],
    };

    render(<AssetCustomFieldForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: values.name },
    });
    fireEvent.change(screen.getByLabelText(/^key$/i), {
      target: { value: values.key },
    });
    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(values);
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks reserved core metadata keys through form submission", async () => {
    const onSubmit = vi.fn();
    render(<AssetCustomFieldForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Environment" },
    });
    fireEvent.change(screen.getByLabelText(/^key$/i), {
      target: { value: "environment" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    expect(
      await screen.findByText("This key is reserved for core asset metadata"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows validation errors after submitting an empty create form", async () => {
    render(<CreateText />);

    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });

  it("validates required fields have a default value", () => {
    const values = {
      name: "Priority",
      key: "priority",
      type: AssetCustomFieldType.Number,
      required: true,
      defaultValue: "",
      options: [{ value: "", label: "" }],
    };
    const result = assetCustomFieldFormSchema.safeParse(values);

    expect(result.success).toBe(false);
    expect(validateAssetCustomFieldFormRuleValues(values)).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
        path: ["defaultValue"],
        message: "Required fields need a default value",
      },
    ]);
  });

  it("validates duplicate select option values", () => {
    const result = assetCustomFieldFormSchema.safeParse({
      name: "Deployment tier",
      key: "deployment_tier",
      type: AssetCustomFieldType.Select,
      required: false,
      defaultValue: "",
      options: [
        { value: "production", label: "Production" },
        { value: "production", label: "Production duplicate" },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected validation to fail");
    }
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["options"],
          message: "Option values must be unique",
        }),
      ]),
    );
  });

  it("validates reserved core asset metadata keys", () => {
    const values = {
      name: "Environment",
      key: "environment",
      type: AssetCustomFieldType.Text,
      required: false,
      defaultValue: "",
      options: [{ value: "", label: "" }],
    };

    expect(validateAssetCustomFieldFormRuleValues(values)).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.ReservedKey,
        path: ["key"],
        message: "This key is reserved for core asset metadata",
      },
    ]);
  });

  it("maps text, number, and select form values to API payloads", () => {
    expect(
      mapAssetCustomFieldFormValues({
        name: "  Category  ",
        key: "  category  ",
        type: AssetCustomFieldType.Text,
        required: false,
        defaultValue: "",
        options: [{ value: "", label: "" }],
      }),
    ).toEqual({
      name: "Category",
      key: "category",
      type: AssetCustomFieldType.Text,
      required: false,
      defaultValue: null,
    });

    expect(
      mapAssetCustomFieldFormValues({
        name: "Priority",
        key: "priority",
        type: AssetCustomFieldType.Number,
        required: true,
        defaultValue: "3",
        options: [{ value: "", label: "" }],
      }),
    ).toEqual({
      name: "Priority",
      key: "priority",
      type: AssetCustomFieldType.Number,
      required: true,
      defaultValue: 3,
    });

    expect(
      mapAssetCustomFieldFormValues({
        name: "Deployment tier",
        key: "deployment_tier",
        type: AssetCustomFieldType.Select,
        required: true,
        defaultValue: "production",
        options: [
          { value: " production ", label: " Production " },
          { value: "staging", label: "Staging" },
        ],
      }),
    ).toEqual({
      name: "Deployment tier",
      key: "deployment_tier",
      type: AssetCustomFieldType.Select,
      required: true,
      defaultValue: "production",
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" },
      ],
    });
  });

  it("maps an existing select definition to edit values", () => {
    const field = ASSET_CUSTOM_FIELD_FIXTURES.find(
      (fixture) => fixture.type === AssetCustomFieldType.Select,
    );

    if (!field) {
      throw new Error("Expected select fixture");
    }

    expect(mapAssetCustomFieldDefinitionToFormValues(field)).toEqual({
      name: "Deployment tier",
      key: "deployment_tier",
      type: AssetCustomFieldType.Select,
      required: true,
      defaultValue: "production",
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" },
      ],
    });
  });

  it("maps edit form values to a full update payload", () => {
    expect(
      mapUpdateAssetCustomFieldFormValues({
        name: "Deployment tier",
        key: "deployment_tier",
        type: AssetCustomFieldType.Select,
        required: true,
        defaultValue: "production",
        options: [
          { value: " production ", label: " Production " },
          { value: "staging", label: "Staging" },
        ],
      }),
    ).toEqual({
      name: "Deployment tier",
      key: "deployment_tier",
      type: AssetCustomFieldType.Select,
      required: true,
      defaultValue: "production",
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" },
      ],
    });
  });
});
