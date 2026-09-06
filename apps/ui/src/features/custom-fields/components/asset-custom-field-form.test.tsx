import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssetCustomFieldForm,
  assetCustomFieldFormSchema,
  mapAssetCustomFieldDefinitionToFormValues,
  mapAssetCustomFieldFormValues,
  mapUpdateAssetCustomFieldFormValues,
} from "@/features/custom-fields/components/asset-custom-field-form";
import * as stories from "@/features/custom-fields/components/asset-custom-field-form.stories";
import { validateAssetCustomFieldFormRuleValues } from "@/features/custom-fields/components/asset-custom-field-rule-validation.ts";
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/test/fixtures.ts";

import type { AssetCustomFieldFormValues } from "@/features/custom-fields/components/asset-custom-field-form";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function renderSelectForm(
  overrides: Partial<AssetCustomFieldFormValues> = {},
  onSubmit = vi.fn().mockResolvedValue(undefined),
) {
  const defaultValues: AssetCustomFieldFormValues = {
    name: "Deployment tier",
    key: "deployment_tier",
    type: AssetCustomFieldType.Select,
    required: false,
    defaultValue: "production",
    options: [
      { value: "production", label: "Production" },
      { value: "staging", label: "Staging" },
    ],
    ...overrides,
  };

  render(
    <AssetCustomFieldForm
      mode="create"
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );

  return { onSubmit };
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

  it("adds, edits, and removes option rows without losing the remaining options", () => {
    renderSelectForm({
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.getByLabelText(/option 3 value/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/option 3 value/i), {
      target: { value: "development" },
    });
    fireEvent.change(screen.getByLabelText(/option 3 label/i), {
      target: { value: "Development" },
    });
    fireEvent.change(screen.getByLabelText(/option 2 label/i), {
      target: { value: "Staging tier" },
    });

    fireEvent.click(screen.getByRole("button", { name: /remove option 2/i }));

    expect(getInputByLabel(/option 1 value/i).value).toBe("production");
    expect(getInputByLabel(/option 1 label/i).value).toBe("Production");
    expect(getInputByLabel(/option 2 value/i).value).toBe("development");
    expect(getInputByLabel(/option 2 label/i).value).toBe("Development");
    expect(screen.queryByLabelText(/option 3 value/i)).toBeNull();
  });

  it("keeps one editable blank row when the last option is removed", () => {
    renderSelectForm({
      options: [{ value: "production", label: "Production" }],
    });

    fireEvent.click(screen.getByRole("button", { name: /remove option 1/i }));

    expect(getInputByLabel(/option 1 value/i).value).toBe("");
    expect(getInputByLabel(/option 1 label/i).value).toBe("");
    expect(screen.getByRole("button", { name: /remove option 1/i })).toBeInTheDocument();
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

  it.each([
    ["option value", { options: [{ value: "  ", label: "Production" }] }, "Enter an option value"],
    ["option label", { options: [{ value: "production", label: "\t" }] }, "Enter an option label"],
  ])("blocks a blank or whitespace %s", async (field, defaultValues, message) => {
    const onSubmit = vi.fn();
    renderSelectForm(defaultValues, onSubmit);

    const optionInput = screen.getByLabelText(
      new RegExp(`option 1 ${field.endsWith("value") ? "value" : "label"}`, "i"),
    );
    fireEvent.change(optionInput, { target: { value: field === "option value" ? "  " : "\t" } });
    fireEvent.blur(optionInput);
    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    expect(await screen.findByText(message)).toBeVisible();
    const result = assetCustomFieldFormSchema.safeParse({
      name: "Deployment tier",
      key: "deployment_tier",
      type: AssetCustomFieldType.Select,
      required: false,
      defaultValue: "production",
      ...defaultValues,
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected validation to fail");
    }
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.arrayContaining(["options"]), message }),
      ]),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks a select with no options", async () => {
    const onSubmit = vi.fn();
    renderSelectForm({ options: [{ value: "", label: "" }] }, onSubmit);

    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    expect(await screen.findByText("Add at least one option")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows duplicate normalized option errors and allows a corrected retry", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderSelectForm({}, onSubmit);

    fireEvent.change(screen.getByLabelText(/option 2 value/i), {
      target: { value: " production " },
    });
    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    expect(await screen.findByText("Option values must be unique")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/option 2 value/i), {
      target: { value: "staging" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        options: [
          { value: "production", label: "Production" },
          { value: "staging", label: "Staging" },
        ],
      }),
    );
  });

  it("blocks a default that is no longer present in the options", async () => {
    const onSubmit = vi.fn();
    renderSelectForm({ defaultValue: "retired" }, onSubmit);

    expect(screen.getByRole("combobox", { name: /default value/i })).toHaveTextContent("retired");
    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    expect(
      await screen.findByText("Select a default from the available options"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("updates the displayed select default when selecting, clearing, renaming, and removing options", async () => {
    const user = userEvent.setup();
    renderSelectForm();

    await user.click(screen.getByRole("combobox", { name: /default value/i }));
    await user.click(screen.getByRole("option", { name: "Staging" }));
    expect(screen.getByRole("combobox", { name: /default value/i })).toHaveTextContent("Staging");

    const defaultSelect = screen.getByRole("combobox", { name: /default value/i });
    fireEvent.click(defaultSelect);
    await user.click(await screen.findByRole("option", { name: "No default" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /default value/i })).toHaveTextContent(
        "No default",
      ),
    );

    cleanup();
    renderSelectForm();
    fireEvent.change(screen.getByLabelText(/option 1 label/i), {
      target: { value: "Production tier" },
    });
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /default value/i })).toHaveTextContent(
        "Production tier",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /remove option 1/i }));
    expect(screen.getByRole("combobox", { name: /default value/i })).toHaveTextContent(
      "production",
    );
  });

  it("submits valid number and select values in create and edit modes", async () => {
    const createSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AssetCustomFieldForm
        mode="create"
        defaultValues={{
          name: "Priority",
          key: "priority",
          type: AssetCustomFieldType.Number,
          required: false,
          defaultValue: "0",
        }}
        onSubmit={createSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /required/i }));
    fireEvent.click(screen.getByRole("button", { name: /create custom field/i }));

    await waitFor(() => expect(createSubmit).toHaveBeenCalledTimes(1));
    expect(createSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AssetCustomFieldType.Number,
        defaultValue: "0",
        required: true,
      }),
    );

    cleanup();
    const editSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AssetCustomFieldForm
        mode="edit"
        defaultValues={{
          name: "Deployment tier",
          key: "deployment_tier",
          type: AssetCustomFieldType.Select,
          required: true,
          defaultValue: "production",
          options: [
            { value: "production", label: "Production" },
            { value: "staging", label: "Staging" },
          ],
        }}
        onSubmit={editSubmit}
        onCancel={vi.fn()}
        submitLabel="Update definition"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Update definition" }));

    await waitFor(() => expect(editSubmit).toHaveBeenCalledTimes(1));
    expect(editSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: AssetCustomFieldType.Select, defaultValue: "production" }),
    );
  });

  it("holds a deferred submit until it resolves, then calls cancel", async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const onSubmit = vi.fn().mockImplementation(() => pending.promise);
    const onCancel = vi.fn();
    render(
      <AssetCustomFieldForm
        mode="edit"
        defaultValues={{
          name: "Deployment tier",
          key: "deployment_tier",
          type: AssetCustomFieldType.Select,
          required: false,
          defaultValue: "production",
          options: [
            { value: "production", label: "Production" },
            { value: "staging", label: "Staging" },
          ],
        }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText(/^name$/i)).toBeDisabled());
    expect(screen.getByLabelText(/^key$/i)).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /^type$/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /required/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("combobox", { name: /default value/i })).toBeDisabled();
    expect(screen.getByLabelText(/option 1 value/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /add option/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /remove option 1/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    pending.resolve();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
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

  it("rejects non-finite number defaults at the form boundary", () => {
    const result = assetCustomFieldFormSchema.safeParse({
      name: "Priority",
      key: "priority",
      type: AssetCustomFieldType.Number,
      required: false,
      defaultValue: "Infinity",
      options: [{ value: "", label: "" }],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected validation to fail");
    }
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["defaultValue"],
          message: "Enter a valid number",
        }),
      ]),
    );
  });

  it("maps blank defaults to null while preserving numeric zero", () => {
    const base = {
      name: "Field",
      key: "field",
      required: false,
      options: [{ value: "", label: "" }],
    };

    expect(
      mapAssetCustomFieldFormValues({
        ...base,
        type: AssetCustomFieldType.Text,
        defaultValue: "",
      }),
    ).toMatchObject({ type: AssetCustomFieldType.Text, defaultValue: null });
    expect(
      mapAssetCustomFieldFormValues({
        ...base,
        type: AssetCustomFieldType.Number,
        defaultValue: "",
      }),
    ).toMatchObject({ type: AssetCustomFieldType.Number, defaultValue: null });
    expect(
      mapAssetCustomFieldFormValues({
        ...base,
        type: AssetCustomFieldType.Number,
        defaultValue: "0",
      }),
    ).toMatchObject({ type: AssetCustomFieldType.Number, defaultValue: 0 });
    expect(
      mapAssetCustomFieldFormValues({
        ...base,
        type: AssetCustomFieldType.Select,
        defaultValue: "",
        options: [{ value: "production", label: "Production" }],
      }),
    ).toMatchObject({ type: AssetCustomFieldType.Select, defaultValue: null });
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
        defaultValue: "  Security  ",
        options: [{ value: "", label: "" }],
      }),
    ).toEqual({
      name: "Category",
      key: "category",
      type: AssetCustomFieldType.Text,
      required: false,
      defaultValue: "  Security  ",
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

  it("maps persisted text and number definitions, including nullable and zero defaults", () => {
    const definitions: Array<AssetCustomFieldDefinition> = [
      {
        id: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
        name: "Category",
        key: "category",
        type: AssetCustomFieldType.Text,
        required: false,
        defaultValue: "Security",
      },
      {
        id: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
        name: "Priority",
        key: "priority",
        type: AssetCustomFieldType.Number,
        required: false,
        defaultValue: 0,
      },
      {
        id: "4b4f4dc9-77d5-4bb5-90a4-0d764a5fbf4b",
        name: "Unset priority",
        key: "unset_priority",
        type: AssetCustomFieldType.Number,
        required: false,
        defaultValue: null,
      },
    ];

    expect(definitions.map(mapAssetCustomFieldDefinitionToFormValues)).toEqual([
      expect.objectContaining({ type: AssetCustomFieldType.Text, defaultValue: "Security" }),
      expect.objectContaining({ type: AssetCustomFieldType.Number, defaultValue: "0" }),
      expect.objectContaining({ type: AssetCustomFieldType.Number, defaultValue: "" }),
    ]);
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
