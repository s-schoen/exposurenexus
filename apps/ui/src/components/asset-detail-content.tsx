import { useState } from "react"
import { AlertCircle, RotateCcw, Server } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource
} from "@openvlp/types/model/asset"
import type {
  AssetCustomFieldValue,
  AssetCustomFieldValueLiteral
} from "@openvlp/types/model/asset"
import type { ReactNode } from "react"
import {
  clearAssetCustomFieldValue,
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  updateAssetCustomFieldValues
} from "@/api/asset.ts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { capitalizeFirstLetter } from "@/lib/format.ts"
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx"
import { MetadataSidebar } from "@/components/metadata-sidebar/index.tsx"
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx"
import { Inplace } from "@/components/inplace.tsx"
import { Button } from "@/components/ui/button.tsx"
import { cn } from "@/lib/utils.ts"
import { toastActionError } from "@/lib/action-error-toast.ts"

interface AssetDetailContentProps {
  assetId: string
  titleAction?: ReactNode
}

export function formatAssetCustomFieldValue(
  field: AssetCustomFieldValue
): string {
  if (field.value === null) {
    return "None"
  }

  if (field.type === AssetCustomFieldType.Select) {
    return (
      field.options.find((option) => option.value === field.value)?.label ??
      field.value
    )
  }

  return String(field.value)
}

export function getAssetCustomFieldDraftValue(
  field: AssetCustomFieldValue
): string {
  return field.value === null ? "" : String(field.value)
}

export function createAssetCustomFieldValuePayload(
  field: AssetCustomFieldValue,
  value: string
): AssetCustomFieldValueLiteral {
  if (field.type === AssetCustomFieldType.Number) {
    const trimmed = value.trim()
    return trimmed === "" ? null : Number(trimmed)
  }

  return value
}

export function AssetDetailContent({
  assetId,
  titleAction
}: AssetDetailContentProps) {
  const queryClient = useQueryClient()
  const asset = useQuery(createAssetByIDQueryOptions(assetId))
  const customFieldValuesQueryOptions =
    createAssetCustomFieldValuesQueryOptions(assetId)
  const customFields = useQuery(customFieldValuesQueryOptions)

  async function handleSaveCustomFieldValue(
    field: AssetCustomFieldValue,
    value: string
  ) {
    const payload = createAssetCustomFieldValuePayload(field, value)

    try {
      const updated = await updateAssetCustomFieldValues(assetId, [
        {
          fieldId: field.fieldId,
          value: payload
        }
      ])

      queryClient.setQueryData(customFieldValuesQueryOptions.queryKey, updated)
      await queryClient.invalidateQueries({
        queryKey: customFieldValuesQueryOptions.queryKey
      })
    } catch (error) {
      toastActionError(error, "Failed to update asset custom field")
      throw error
    }
  }

  async function handleResetCustomFieldValue(field: AssetCustomFieldValue) {
    try {
      await clearAssetCustomFieldValue(assetId, field.fieldId)
      await queryClient.invalidateQueries({
        queryKey: customFieldValuesQueryOptions.queryKey
      })
    } catch (error) {
      toastActionError(error, "Failed to reset asset custom field")
    }
  }

  function CardPlaceholder() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asset details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  function AssetOverviewCard() {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{titleAction}</div>
            <Badge variant="outline" className="rounded-md">
              <Server className="size-3" />
              {capitalizeFirstLetter(asset.data!.type)}
            </Badge>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {asset.data!.name}
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">
                Inventory record representing a tracked platform asset that can
                be linked to findings and vulnerability exposure.
              </CardDescription>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              <DetailHighlightCard
                label="Asset name"
                value={asset.data!.name}
                description="Primary identifier used across the platform"
              />
              <DetailHighlightCard
                label="Asset type"
                value={capitalizeFirstLetter(asset.data!.type)}
                description="Inventory classification for this asset"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  function AssetSidebar() {
    return (
      <MetadataSidebar title="Asset details" icon={Server}>
        <div className="space-y-3">
          <MetadataDetailRow label="Name" value={asset.data!.name} />
          <MetadataDetailRow
            label="Type"
            value={capitalizeFirstLetter(asset.data!.type)}
          />
        </div>
        <Separator />
        <AssetCustomFieldsSidebarSection
          customFields={customFields.data}
          isError={customFields.isError}
          isPending={customFields.isPending}
          onReset={handleResetCustomFieldValue}
          onSave={handleSaveCustomFieldValue}
        />
      </MetadataSidebar>
    )
  }

  return asset.isPending ? (
    <CardPlaceholder />
  ) : (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <AssetOverviewCard />
      </div>
      <AssetSidebar />
    </div>
  )
}

interface AssetCustomFieldsSidebarSectionProps {
  customFields?: Array<AssetCustomFieldValue>
  isError: boolean
  isPending: boolean
  onReset: (field: AssetCustomFieldValue) => void | Promise<void>
  onSave: (field: AssetCustomFieldValue, value: string) => void | Promise<void>
}

function AssetCustomFieldsSidebarSection({
  customFields,
  isError,
  isPending,
  onReset,
  onSave
}: AssetCustomFieldsSidebarSectionProps) {
  if (isPending) {
    return (
      <div className="space-y-3" aria-label="Custom fields loading">
        <CustomFieldsSectionTitle />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <CustomFieldsSectionTitle />
        <Alert variant="destructive" className="px-3 py-2">
          <AlertCircle className="size-4" />
          <AlertTitle className="text-sm">
            Unable to load custom fields
          </AlertTitle>
          <AlertDescription className="text-xs">
            The asset details are still available.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!customFields || customFields.length === 0) {
    return (
      <div className="space-y-3">
        <CustomFieldsSectionTitle />
        <p className="text-sm text-muted-foreground">No custom fields</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CustomFieldsSectionTitle />
      {customFields.map((field) => (
        <AssetCustomFieldSidebarRow
          key={field.fieldId}
          field={field}
          onReset={onReset}
          onSave={onSave}
        />
      ))}
    </div>
  )
}

function CustomFieldsSectionTitle() {
  return (
    <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
      Custom fields
    </h3>
  )
}

interface AssetCustomFieldSidebarRowProps {
  field: AssetCustomFieldValue
  onReset: (field: AssetCustomFieldValue) => void | Promise<void>
  onSave: (field: AssetCustomFieldValue, value: string) => void | Promise<void>
}

function AssetCustomFieldSidebarRow({
  field,
  onReset,
  onSave
}: AssetCustomFieldSidebarRowProps) {
  const isAssetValue = field.source === AssetCustomFieldValueSource.Asset
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div className="space-y-2">
      <span className="block min-w-0 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {field.name}
      </span>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm text-foreground">
          <Inplace
            value={getAssetCustomFieldDraftValue(field)}
            onSave={(value) => onSave(field, value)}
            displayElement={() => (
              <span
                className={cn("block truncate", {
                  "text-muted-foreground": field.value === null
                })}
              >
                {formatAssetCustomFieldValue(field)}
              </span>
            )}
            editElement={getCustomFieldEditElement(field)}
            editOnClick
            showEditIcon={false}
            onEditingChange={setIsEditing}
          />
        </div>
        {isAssetValue && !isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Reset ${field.name}`}
            title="Reset to default"
            onClick={() => onReset(field)}
          >
            <RotateCcw />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function getCustomFieldEditElement(field: AssetCustomFieldValue) {
  if (field.type === AssetCustomFieldType.Select) {
    return {
      type: "select" as const,
      options: field.options.map((option) => ({
        label: option.label,
        value: option.value
      }))
    }
  }

  return {
    type: "input" as const,
    inputType:
      field.type === AssetCustomFieldType.Number ? ("number" as const) : "text"
  }
}
