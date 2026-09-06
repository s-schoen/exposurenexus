import {
  AssetCustomFieldType,
  assetCustomFieldKeySchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { useForm, useStore } from "@tanstack/react-form";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod/v4";

import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  createAssetCustomFieldDefinitionPayloadFromFormValues,
  updateAssetCustomFieldDefinitionPayloadFromFormValues,
  validateAssetCustomFieldFormRuleValues,
} from "@/features/custom-fields/components/asset-custom-field-rule-validation.ts";

import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";

export type AssetCustomFieldFormMode = "create" | "edit";

export interface AssetCustomFieldFormOptionValue {
  value: string;
  label: string;
}

export interface AssetCustomFieldFormValues {
  name: string;
  key: string;
  type: AssetCustomFieldType;
  required: boolean;
  defaultValue: string;
  options: Array<AssetCustomFieldFormOptionValue>;
}

interface AssetCustomFieldFormProps {
  mode: AssetCustomFieldFormMode;
  defaultValues?: Partial<AssetCustomFieldFormValues>;
  onSubmit: (values: AssetCustomFieldFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

const NO_DEFAULT_SELECT_VALUE = "__no_default__";

const optionFormSchema = z.strictObject({
  value: z.string(),
  label: z.string(),
});

export const assetCustomFieldFormSchema = z
  .strictObject({
    name: z.string().trim().min(1, "Enter a name"),
    key: assetCustomFieldKeySchema,
    type: z.enum(AssetCustomFieldType),
    required: z.boolean(),
    defaultValue: z.string(),
    options: z.array(optionFormSchema),
  })
  .superRefine((values, ctx) => {
    const defaultValue = values.defaultValue.trim();

    if (
      values.type === AssetCustomFieldType.Number &&
      defaultValue !== "" &&
      !Number.isFinite(Number(defaultValue))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultValue"],
        message: "Enter a valid number",
      });
    }

    if (values.type === AssetCustomFieldType.Select) {
      const normalizedOptions = values.options.map((option) => ({
        value: option.value.trim(),
        label: option.label.trim(),
      }));
      const nonEmptyOptions = normalizedOptions.filter(
        (option) => option.value !== "" || option.label !== "",
      );

      if (nonEmptyOptions.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Add at least one option",
        });
      }

      for (const [index, option] of normalizedOptions.entries()) {
        if (option.value === "") {
          ctx.addIssue({
            code: "custom",
            path: ["options", index, "value"],
            message: "Enter an option value",
          });
        }

        if (option.label === "") {
          ctx.addIssue({
            code: "custom",
            path: ["options", index, "label"],
            message: "Enter an option label",
          });
        }
      }
    }

    for (const issue of validateAssetCustomFieldFormRuleValues(values)) {
      ctx.addIssue({
        code: "custom",
        path: [...issue.path],
        message: issue.message,
      });
    }
  });

const DEFAULT_ASSET_CUSTOM_FIELD_FORM_VALUES: AssetCustomFieldFormValues = {
  name: "",
  key: "",
  type: AssetCustomFieldType.Text,
  required: false,
  defaultValue: "",
  options: [{ value: "", label: "" }],
};

function formatTypeLabel(type: AssetCustomFieldType): string {
  switch (type) {
    case AssetCustomFieldType.Text:
      return "Text";
    case AssetCustomFieldType.Number:
      return "Number";
    case AssetCustomFieldType.Select:
      return "Select";
  }
}

export function mapAssetCustomFieldDefinitionToFormValues(
  field: AssetCustomFieldDefinition,
): AssetCustomFieldFormValues {
  return {
    name: field.name,
    key: field.key,
    type: field.type,
    required: field.required,
    defaultValue: field.defaultValue === null ? "" : String(field.defaultValue),
    options:
      field.type === AssetCustomFieldType.Select
        ? field.options.map((option) => ({
            value: option.value,
            label: option.label,
          }))
        : [{ value: "", label: "" }],
  };
}

export function mapAssetCustomFieldFormValues(
  values: AssetCustomFieldFormValues,
): CreateAssetCustomFieldDefinition {
  return createAssetCustomFieldDefinitionPayloadFromFormValues(values);
}

export function mapUpdateAssetCustomFieldFormValues(
  values: AssetCustomFieldFormValues,
): UpdateAssetCustomFieldDefinition {
  return updateAssetCustomFieldDefinitionPayloadFromFormValues(values);
}

function getErrorMessages(errors: unknown): Array<{ message: string }> {
  const values = Array.isArray(errors) ? errors : [errors];

  return values.flatMap((error) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return [{ message: error.message }];
    }

    return [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOptionErrorMessages(formError: unknown): Array<{ message: string }> {
  if (!isRecord(formError)) {
    return [];
  }

  const fields = "fields" in formError ? formError.fields : formError;
  if (!isRecord(fields)) {
    return [];
  }

  return Object.entries(fields)
    .filter(([path]) => path.startsWith("options["))
    .flatMap(([, errors]) => getErrorMessages(errors));
}

export function AssetCustomFieldForm({
  mode,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
}: AssetCustomFieldFormProps) {
  const isCreateMode = mode === "create";
  const form = useForm({
    defaultValues: {
      ...DEFAULT_ASSET_CUSTOM_FIELD_FORM_VALUES,
      ...defaultValues,
    },
    validators: {
      onSubmit: assetCustomFieldFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const resolvedSubmitLabel =
    submitLabel ?? (isCreateMode ? "Create custom field" : "Save changes");

  return (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader>
        <CardTitle>{isCreateMode ? "Create custom field" : "Edit custom field"}</CardTitle>
        <CardDescription>
          {isCreateMode
            ? "Define an asset metadata field that can be used across assets."
            : "Update the field definition and the available values for assets."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id={`asset-custom-field-form-${mode}`}
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <form.Field
              name="name"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="Category"
                      disabled={isSubmitting}
                    />
                    <FieldDescription>
                      This is the label shown when editing or reviewing assets.
                    </FieldDescription>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            />
            <form.Field
              name="key"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Key</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="category"
                      disabled={isSubmitting}
                    />
                    <FieldDescription>
                      Use lowercase letters, numbers, and underscores. The key must start with a
                      letter and cannot recreate core asset metadata such as type or environment.
                    </FieldDescription>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            />
            <form.Field
              name="type"
              children={(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Type</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        field.handleChange(value as AssetCustomFieldType);
                        field.handleBlur();
                      }}
                    >
                      <SelectTrigger
                        id={field.name}
                        aria-invalid={isInvalid}
                        className="w-full bg-background text-foreground"
                        disabled={isSubmitting}
                      >
                        <span className="min-w-0 flex-1 truncate text-left">
                          {formatTypeLabel(field.state.value)}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(AssetCustomFieldType).map((type) => (
                          <SelectItem key={type} value={type}>
                            {formatTypeLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      The type controls validation and how asset values are edited.
                    </FieldDescription>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            />
            <form.Field
              name="required"
              children={(field) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id={field.name}
                    checked={field.state.value}
                    onCheckedChange={(value) => field.handleChange(!!value)}
                    onBlur={field.handleBlur}
                    disabled={isSubmitting}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <FieldLabel htmlFor={field.name}>Required</FieldLabel>
                    <FieldDescription>
                      Required fields need a default value so every asset has a value.
                    </FieldDescription>
                  </div>
                </Field>
              )}
            />
            <form.Subscribe
              selector={(state) => state.values.type}
              children={(type) => (
                <>
                  <form.Field
                    name="defaultValue"
                    children={(field) => {
                      const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                      if (type === AssetCustomFieldType.Select) {
                        return (
                          <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={field.name}>Default value</FieldLabel>
                            <form.Subscribe
                              selector={(state) => state.values.options}
                              children={(options) => {
                                const selectedValue =
                                  field.state.value.trim() === ""
                                    ? NO_DEFAULT_SELECT_VALUE
                                    : field.state.value;
                                const selectedOption = options.find(
                                  (option) => option.value.trim() === field.state.value.trim(),
                                );
                                const selectedLabel =
                                  selectedValue === NO_DEFAULT_SELECT_VALUE
                                    ? "No default"
                                    : selectedOption?.label.trim() || field.state.value;

                                return (
                                  <Select
                                    value={selectedValue}
                                    onValueChange={(value) => {
                                      if (value === null) {
                                        return;
                                      }

                                      field.handleChange(
                                        value === NO_DEFAULT_SELECT_VALUE ? "" : value,
                                      );
                                      field.handleBlur();
                                    }}
                                  >
                                    <SelectTrigger
                                      id={field.name}
                                      aria-invalid={isInvalid}
                                      className="w-full bg-background text-foreground"
                                      disabled={isSubmitting}
                                    >
                                      <span className="min-w-0 flex-1 truncate text-left">
                                        {selectedLabel}
                                      </span>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={NO_DEFAULT_SELECT_VALUE}>
                                        No default
                                      </SelectItem>
                                      {options
                                        .filter((option) => option.value.trim() !== "")
                                        .map((option) => (
                                          <SelectItem
                                            key={option.value}
                                            value={option.value.trim()}
                                          >
                                            {option.label.trim() || option.value.trim()}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                );
                              }}
                            />
                            <FieldDescription>
                              Optional fields may leave this empty.
                            </FieldDescription>
                            {isInvalid && <FieldError errors={field.state.meta.errors} />}
                          </Field>
                        );
                      }

                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>Default value</FieldLabel>
                          <Input
                            id={field.name}
                            name={field.name}
                            type={type === AssetCustomFieldType.Number ? "number" : "text"}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            aria-invalid={isInvalid}
                            placeholder="No default"
                            disabled={isSubmitting}
                          />
                          <FieldDescription>Optional fields may leave this empty.</FieldDescription>
                          {isInvalid && <FieldError errors={field.state.meta.errors} />}
                        </Field>
                      );
                    }}
                  />
                  {type === AssetCustomFieldType.Select && (
                    <form.Field
                      name="options"
                      children={(field) => (
                        <form.Subscribe
                          selector={(state) => state.errorMap.onSubmit}
                          children={(formError) => {
                            const optionErrors = [
                              ...getErrorMessages(field.state.meta.errors),
                              ...getOptionErrorMessages(formError),
                            ];
                            const isInvalid =
                              field.state.meta.isTouched &&
                              (!field.state.meta.isValid || optionErrors.length > 0);

                            return (
                              <Field data-invalid={isInvalid}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="space-y-1">
                                    <FieldLabel>Select options</FieldLabel>
                                    <FieldDescription>
                                      Option values are stored on assets, while labels are shown in
                                      the UI.
                                    </FieldDescription>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      field.handleChange([
                                        ...field.state.value,
                                        { value: "", label: "" },
                                      ]);
                                      field.handleBlur();
                                    }}
                                    disabled={isSubmitting}
                                  >
                                    <Plus />
                                    Add option
                                  </Button>
                                </div>
                                <div className="space-y-3">
                                  {field.state.value.map((option, index) => (
                                    <div
                                      key={index}
                                      className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                                    >
                                      <Input
                                        aria-label={`Option ${index + 1} value`}
                                        value={option.value}
                                        onChange={(event) => {
                                          const nextOptions = [...field.state.value];
                                          nextOptions[index] = {
                                            ...option,
                                            value: event.target.value,
                                          };
                                          field.handleChange(nextOptions);
                                        }}
                                        onBlur={field.handleBlur}
                                        placeholder="production"
                                        disabled={isSubmitting}
                                      />
                                      <Input
                                        aria-label={`Option ${index + 1} label`}
                                        value={option.label}
                                        onChange={(event) => {
                                          const nextOptions = [...field.state.value];
                                          nextOptions[index] = {
                                            ...option,
                                            label: event.target.value,
                                          };
                                          field.handleChange(nextOptions);
                                        }}
                                        onBlur={field.handleBlur}
                                        placeholder="Production"
                                        disabled={isSubmitting}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Remove option ${index + 1}`}
                                        onClick={() => {
                                          const nextOptions =
                                            field.state.value.length <= 1
                                              ? [{ value: "", label: "" }]
                                              : field.state.value.filter(
                                                  (_currentOption, optionIndex) =>
                                                    optionIndex !== index,
                                                );
                                          field.handleChange(nextOptions);
                                          field.handleBlur();
                                        }}
                                        disabled={isSubmitting}
                                      >
                                        <Trash2 />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                                {isInvalid && <FieldError errors={optionErrors} />}
                              </Field>
                            );
                          }}
                        />
                      )}
                    />
                  )}
                </>
              )}
            />
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {resolvedSubmitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
