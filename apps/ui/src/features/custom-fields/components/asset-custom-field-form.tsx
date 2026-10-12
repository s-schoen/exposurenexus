import {
  AssetCustomFieldType,
  assetCustomFieldKeySchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { useForm, useStore } from "@tanstack/react-form";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod/v4";

import { FormActions } from "@/components/form-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  createAssetCustomFieldDefinitionPayloadFromFormValues,
  updateAssetCustomFieldDefinitionPayloadFromFormValues,
  validateAssetCustomFieldFormRuleValues,
} from "@/features/custom-fields/components/asset-custom-field-rule-validation.ts";
import { formatCustomFieldType } from "@/features/custom-fields/lib/custom-field-type.ts";

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

      // Option issues go on the options field itself: errors on its unmounted sub-paths
      // (`options[0].label`) are never cleared by editing a row, which would block every
      // later submit.
      for (const option of normalizedOptions) {
        if (option.value === "") {
          ctx.addIssue({ code: "custom", path: ["options"], message: "Enter an option value" });
        }

        if (option.label === "") {
          ctx.addIssue({ code: "custom", path: ["options"], message: "Enter an option label" });
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
                  Lowercase letters, numbers and underscores, starting with a letter.
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
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">
                      {formatCustomFieldType(field.state.value)}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(AssetCustomFieldType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {formatCustomFieldType(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <FieldLabel htmlFor={field.name}>Required</FieldLabel>
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
                                  className="w-full"
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
                                      <SelectItem key={option.value} value={option.value.trim()}>
                                        {option.label.trim() || option.value.trim()}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            );
                          }}
                        />
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
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
              {type === AssetCustomFieldType.Select && (
                <form.Field
                  name="options"
                  children={(field) => {
                    const optionErrors = getErrorMessages(field.state.meta.errors);
                    const isInvalid = field.state.meta.isTouched && optionErrors.length > 0;

                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldSet>
                          <FieldLegend variant="label">Select options</FieldLegend>
                          <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-1.5">
                            {field.state.value.map((option, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2 rounded-md border border-border bg-card p-1.5"
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
                                  className="flex-1"
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
                                  className="flex-1"
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
                                            (_currentOption, optionIndex) => optionIndex !== index,
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="self-start"
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
                        </FieldSet>
                        {isInvalid && <FieldError errors={optionErrors} />}
                      </Field>
                    );
                  }}
                />
              )}
            </>
          )}
        />
      </FieldGroup>
      <FormActions>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {resolvedSubmitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
