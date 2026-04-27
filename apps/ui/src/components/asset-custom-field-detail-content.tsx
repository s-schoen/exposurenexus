import { CircleAlert, ListChecks, Plus, Trash2 } from "lucide-react"
import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  AssetCustomFieldType,
  assetCustomFieldKeySchema,
  createAssetCustomFieldDefinitionSchema
} from "@openvlp/types/model/asset"
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldOption,
  CreateAssetCustomFieldDefinition
} from "@openvlp/types/model/asset"
import type { ReactNode } from "react"
import {
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
  updateAssetCustomFieldDefinition
} from "@/api/asset-custom-field.ts"
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx"
import { Inplace } from "@/components/inplace.tsx"
import { MetadataSidebar } from "@/components/metadata-sidebar"
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { toastActionError } from "@/lib/action-error-toast.ts"

interface AssetCustomFieldDetailContentProps {
  customFieldId: string
  titleAction?: ReactNode
}

interface CustomFieldUpdateResult {
  field?: AssetCustomFieldDefinition
  error?: string
}

function formatTypeLabel(type: AssetCustomFieldType): string {
  switch (type) {
    case AssetCustomFieldType.Text:
      return "Text"
    case AssetCustomFieldType.Number:
      return "Number"
    case AssetCustomFieldType.Select:
      return "Select"
  }
}

function formatDefaultValue(field: AssetCustomFieldDefinition): string {
  if (field.defaultValue === null) {
    return "None"
  }

  if (field.type === AssetCustomFieldType.Select) {
    const matchingOption = field.options.find(
      (option) => option.value === field.defaultValue
    )

    return matchingOption?.label ?? field.defaultValue
  }

  return String(field.defaultValue)
}

function formatOptionCount(field: AssetCustomFieldDefinition): string {
  if (field.type !== AssetCustomFieldType.Select) {
    return "N/A"
  }

  return `${field.options.length} option${field.options.length === 1 ? "" : "s"}`
}

function createOptimisticOption(
  fieldId: string,
  value: string,
  label: string
): AssetCustomFieldOption {
  return {
    id: crypto.randomUUID(),
    fieldId,
    value,
    label
  }
}

function parseNumberDefault(value: string | number | null): number | null {
  if (value === null || String(value).trim() === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function createAssetCustomFieldUpdatePayload(
  field: AssetCustomFieldDefinition
): CreateAssetCustomFieldDefinition {
  const base = {
    key: field.key,
    name: field.name,
    required: field.required
  }

  switch (field.type) {
    case AssetCustomFieldType.Text:
      return {
        ...base,
        type: AssetCustomFieldType.Text,
        defaultValue: field.defaultValue
      }
    case AssetCustomFieldType.Number:
      return {
        ...base,
        type: AssetCustomFieldType.Number,
        defaultValue: field.defaultValue
      }
    case AssetCustomFieldType.Select:
      return {
        ...base,
        type: AssetCustomFieldType.Select,
        defaultValue: field.defaultValue,
        options: field.options.map((option) => ({
          value: option.value,
          label: option.label
        }))
      }
  }
}

export function validateAssetCustomFieldDefinition(
  field: AssetCustomFieldDefinition
): string | null {
  const payload = createAssetCustomFieldUpdatePayload(field)
  const parseResult = createAssetCustomFieldDefinitionSchema.safeParse(payload)

  if (!parseResult.success) {
    return parseResult.error.issues[0]?.message ?? "Invalid custom field"
  }

  if (field.required && field.defaultValue === null) {
    return "Required fields need a default value"
  }

  if (field.type !== AssetCustomFieldType.Select) {
    return null
  }

  const optionValues = field.options.map((option) => option.value.trim())
  const optionLabels = field.options.map((option) => option.label.trim())

  if (optionValues.some((value) => value === "")) {
    return "Option values cannot be empty"
  }

  if (optionLabels.some((label) => label === "")) {
    return "Option labels cannot be empty"
  }

  if (new Set(optionValues).size !== optionValues.length) {
    return "Option values must be unique"
  }

  if (
    field.defaultValue !== null &&
    !optionValues.includes(field.defaultValue)
  ) {
    return "Default value must match an available option"
  }

  return null
}

export function updateAssetCustomFieldType(
  field: AssetCustomFieldDefinition,
  type: AssetCustomFieldType
): AssetCustomFieldDefinition {
  if (field.type === type) {
    return field
  }

  const currentDefault =
    field.defaultValue === null ? null : String(field.defaultValue)

  switch (type) {
    case AssetCustomFieldType.Text:
      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: AssetCustomFieldType.Text,
        defaultValue: currentDefault
      }
    case AssetCustomFieldType.Number:
      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: AssetCustomFieldType.Number,
        defaultValue: parseNumberDefault(currentDefault)
      }
    case AssetCustomFieldType.Select: {
      const optionValue = currentDefault?.trim() || "option"
      const optionLabel = currentDefault?.trim() || "Option"
      const hasDefaultValue = Boolean(currentDefault?.trim())

      return {
        id: field.id,
        key: field.key,
        name: field.name,
        required: field.required,
        type: AssetCustomFieldType.Select,
        defaultValue: hasDefaultValue || field.required ? optionValue : null,
        options: [createOptimisticOption(field.id, optionValue, optionLabel)]
      }
    }
  }
}

export function updateAssetCustomFieldOption(
  field: AssetCustomFieldDefinition,
  optionId: string,
  patch: Partial<Pick<AssetCustomFieldOption, "label" | "value">>
): CustomFieldUpdateResult {
  if (field.type !== AssetCustomFieldType.Select) {
    return { error: "Only select fields have options" }
  }

  const currentOption = field.options.find((option) => option.id === optionId)

  if (!currentOption) {
    return { error: "Option could not be found" }
  }

  const nextValue = (patch.value ?? currentOption.value).trim()
  const nextLabel = (patch.label ?? currentOption.label).trim()

  if (nextValue === "") {
    return { error: "Option values cannot be empty" }
  }

  if (nextLabel === "") {
    return { error: "Option labels cannot be empty" }
  }

  const nextOptions = field.options.map((option) =>
    option.id === optionId
      ? { ...option, value: nextValue, label: nextLabel }
      : option
  )
  const duplicateOption = nextOptions.some(
    (option, index) =>
      nextOptions.findIndex((candidate) => candidate.value === option.value) !==
      index
  )

  if (duplicateOption) {
    return { error: "Option values must be unique" }
  }

  return {
    field: {
      ...field,
      options: nextOptions,
      defaultValue:
        field.defaultValue === currentOption.value
          ? nextValue
          : field.defaultValue
    }
  }
}

export function addAssetCustomFieldOption(
  field: AssetCustomFieldDefinition
): CustomFieldUpdateResult {
  if (field.type !== AssetCustomFieldType.Select) {
    return { error: "Only select fields have options" }
  }

  const existingValues = new Set(field.options.map((option) => option.value))
  let optionNumber = field.options.length + 1
  let optionValue = `option_${optionNumber}`

  while (existingValues.has(optionValue)) {
    optionNumber += 1
    optionValue = `option_${optionNumber}`
  }

  const option = createOptimisticOption(
    field.id,
    optionValue,
    `Option ${optionNumber}`
  )

  return {
    field: {
      ...field,
      defaultValue:
        field.required && field.defaultValue === null
          ? option.value
          : field.defaultValue,
      options: [...field.options, option]
    }
  }
}

export function removeAssetCustomFieldOption(
  field: AssetCustomFieldDefinition,
  optionId: string
): CustomFieldUpdateResult {
  if (field.type !== AssetCustomFieldType.Select) {
    return { error: "Only select fields have options" }
  }

  if (field.options.length <= 1) {
    return { error: "Select fields need at least one option" }
  }

  const option = field.options.find(
    (currentOption) => currentOption.id === optionId
  )

  if (!option) {
    return { error: "Option could not be found" }
  }

  if (field.required && field.defaultValue === option.value) {
    return { error: "Select another default before removing this option" }
  }

  return {
    field: {
      ...field,
      defaultValue:
        field.defaultValue === option.value ? null : field.defaultValue,
      options: field.options.filter(
        (currentOption) => currentOption.id !== optionId
      )
    }
  }
}

function CustomFieldRequiredBadge({ required }: { required: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        required
          ? "rounded-full border-amber-200 bg-amber-50 text-amber-700"
          : "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
      }
    >
      {required ? "Required" : "Optional"}
    </Badge>
  )
}

export function AssetCustomFieldDetailContent({
  customFieldId,
  titleAction
}: AssetCustomFieldDetailContentProps) {
  const queryClient = useQueryClient()
  const queryOptions =
    createAssetCustomFieldDefinitionByIDQueryOptions(customFieldId)
  const customField = useQuery(queryOptions)

  const handleUpdateField = useCallback(
    async (nextField: AssetCustomFieldDefinition) => {
      if (!customField.data) {
        return
      }

      const validationMessage = validateAssetCustomFieldDefinition(nextField)

      if (validationMessage) {
        toast.error(validationMessage)
        return
      }

      const payload = createAssetCustomFieldUpdatePayload(nextField)

      try {
        queryClient.setQueryData(queryOptions.queryKey, nextField)
        const updatedField = await updateAssetCustomFieldDefinition(
          customFieldId,
          payload
        )
        queryClient.setQueryData(queryOptions.queryKey, updatedField)
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryOptions.queryKey
          }),
          queryClient.invalidateQueries({
            queryKey:
              createListAssetCustomFieldDefinitionsQueryOptions().queryKey
          })
        ])
      } catch (error) {
        queryClient.setQueryData(queryOptions.queryKey, customField.data)
        toastActionError(error, "Failed to update custom field")
        console.error(error)
      }
    },
    [customField.data, customFieldId, queryClient, queryOptions.queryKey]
  )

  function CardPlaceholder() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Custom field details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  function ErrorCard() {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Custom field details</CardTitle>
          <CardDescription>
            The selected custom field could not be loaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load custom field</AlertTitle>
            <AlertDescription>
              {customField.error?.message ??
                "The API did not return a custom field record."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (customField.isPending) {
    return <CardPlaceholder />
  }

  if (!customField.data) {
    return <ErrorCard />
  }

  const field = customField.data
  const typeLabel = formatTypeLabel(field.type)
  const defaultValue = formatDefaultValue(field)

  const handleUpdateResult = (result: CustomFieldUpdateResult) => {
    if (result.error) {
      toast.error(result.error)
      return
    }

    if (result.field) {
      void handleUpdateField(result.field)
    }
  }

  function FieldOverviewCard() {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{titleAction}</div>
            <CustomFieldRequiredBadge required={field.required} />
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {field.name}
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">
                Asset metadata field definition used to capture additional
                registry information.
              </CardDescription>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DetailHighlightCard
                label="Key"
                value={field.key}
                description="Stable identifier used by the API"
              />
              <DetailHighlightCard
                label="Type"
                value={typeLabel}
                description="Value shape and validation rule"
              />
              <DetailHighlightCard
                label="Default"
                value={defaultValue}
                description="Value applied when an asset has no override"
              />
              <DetailHighlightCard
                label="Options"
                value={formatOptionCount(field)}
                description="Allowed values for select fields"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  function FieldDefinitionCard() {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-xl font-semibold">
                Definition
              </CardTitle>
              <CardDescription>
                General settings for this asset custom field.
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-md">
              <ListChecks className="size-3" />
              {typeLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Name</div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {field.name}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Key</div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 font-mono text-sm text-muted-foreground">
              {field.key}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Type</div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {typeLabel}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              Default value
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {defaultValue}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  function SelectOptionsCard() {
    if (field.type !== AssetCustomFieldType.Select) {
      return null
    }

    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-xl font-semibold">
                Select options
              </CardTitle>
              <CardDescription>
                Values available when assigning this field to an asset.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                handleUpdateResult(addAssetCustomFieldOption(field))
              }
            >
              <Plus />
              Add option
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {field.options.map((option) => (
            <div
              key={option.id}
              className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Value
                </div>
                <div className="font-mono text-sm">
                  <Inplace
                    value={option.value}
                    editOnClick
                    showEditIcon={false}
                    onSave={(value) =>
                      handleUpdateResult(
                        updateAssetCustomFieldOption(field, option.id, {
                          value
                        })
                      )
                    }
                  />
                </div>
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Label
                </div>
                <div className="text-sm">
                  <Inplace
                    value={option.label}
                    editOnClick
                    showEditIcon={false}
                    onSave={(value) =>
                      handleUpdateResult(
                        updateAssetCustomFieldOption(field, option.id, {
                          label: value
                        })
                      )
                    }
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${option.label}`}
                onClick={() =>
                  handleUpdateResult(
                    removeAssetCustomFieldOption(field, option.id)
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  function FieldSidebar() {
    const defaultSelectOptions =
      field.type === AssetCustomFieldType.Select
        ? [
            ...(field.required
              ? []
              : [
                  {
                    label: "None",
                    value: "__none__"
                  }
                ]),
            ...field.options.map((option) => ({
              label: option.label,
              value: option.value
            }))
          ]
        : []

    return (
      <MetadataSidebar title="Custom field details" icon={ListChecks}>
        <div className="space-y-3">
          <MetadataDetailRow
            label="Name"
            editable={{
              value: field.name,
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) =>
                handleUpdateField({ ...field, name: value.trim() })
            }}
          />
          <MetadataDetailRow
            label="Key"
            editable={{
              value: field.key,
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) => {
                const nextKey = value.trim()
                const validationResult =
                  assetCustomFieldKeySchema.safeParse(nextKey)

                if (!validationResult.success) {
                  toast.error(
                    "Keys must start with a letter and use lowercase letters, numbers, and underscores"
                  )
                  return
                }

                return handleUpdateField({ ...field, key: nextKey })
              }
            }}
          />
          <MetadataDetailRow
            label="Type"
            editable={{
              value: field.type,
              displayElement: (typeValue) => formatTypeLabel(typeValue),
              editElement: {
                type: "select",
                options: Object.values(AssetCustomFieldType).map((type) => ({
                  label: formatTypeLabel(type),
                  value: type
                }))
              },
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) =>
                handleUpdateField(updateAssetCustomFieldType(field, value))
            }}
          />
          <MetadataDetailRow
            label="Required"
            editable={{
              value: field.required ? "required" : "optional",
              displayElement: (value) => (
                <CustomFieldRequiredBadge required={value === "required"} />
              ),
              editElement: {
                type: "select",
                options: [
                  { label: "Required", value: "required" },
                  { label: "Optional", value: "optional" }
                ]
              },
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) =>
                handleUpdateField({
                  ...field,
                  required: value === "required"
                })
            }}
          />
          <MetadataDetailRow
            label="Default"
            editable={{
              value:
                field.type === AssetCustomFieldType.Select &&
                field.defaultValue === null
                  ? "__none__"
                  : field.defaultValue === null
                    ? ""
                    : String(field.defaultValue),
              displayElement: () => formatDefaultValue(field),
              editElement:
                field.type === AssetCustomFieldType.Select
                  ? {
                      type: "select",
                      options: defaultSelectOptions
                    }
                  : {
                      type: "input",
                      inputType:
                        field.type === AssetCustomFieldType.Number
                          ? "number"
                          : "text"
                    },
              editOnClick: true,
              showEditIcon: false,
              onSave: (value) => {
                const nextValue = value.trim()

                switch (field.type) {
                  case AssetCustomFieldType.Text:
                    return handleUpdateField({
                      ...field,
                      defaultValue: nextValue === "" ? null : nextValue
                    })
                  case AssetCustomFieldType.Number:
                    return handleUpdateField({
                      ...field,
                      defaultValue: parseNumberDefault(nextValue)
                    })
                  case AssetCustomFieldType.Select:
                    return handleUpdateField({
                      ...field,
                      defaultValue:
                        nextValue === "__none__" || nextValue === ""
                          ? null
                          : nextValue
                    })
                }
              }
            }}
          />
          <MetadataDetailRow label="Options" value={formatOptionCount(field)} />
        </div>
      </MetadataSidebar>
    )
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <FieldOverviewCard />
        <FieldDefinitionCard />
        <SelectOptionsCard />
      </div>
      <FieldSidebar />
    </div>
  )
}
