import { ListChecks } from "lucide-react"
import { AssetCustomFieldType } from "@exposurenexus/types/model/asset-custom-field"
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field"
import type { EditElement } from "@/components/inplace.tsx"
import type { CustomFieldSummary } from "@/components/asset-custom-field-detail-content/helpers.ts"
import type {
  CustomFieldUpdateHandler,
  CustomFieldUpdateResultHandler
} from "@/components/asset-custom-field-detail-content/types.ts"
import {
  formatTypeLabel,
  getDefaultSelectOptions,
  getEditableDefaultValue,
  updateAssetCustomFieldDefaultValue,
  updateAssetCustomFieldKey,
  updateAssetCustomFieldType
} from "@/components/asset-custom-field-detail-content/helpers.ts"
import { CustomFieldRequiredBadge } from "@/components/asset-custom-field-detail-content/detail-cards.tsx"
import { MetadataSidebar } from "@/components/metadata-sidebar"
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx"

export function CustomFieldSidebar({
  field,
  summary,
  onUpdateField,
  onUpdateResult
}: {
  field: AssetCustomFieldDefinition
  summary: CustomFieldSummary
  onUpdateField: CustomFieldUpdateHandler
  onUpdateResult: CustomFieldUpdateResultHandler
}) {
  return (
    <MetadataSidebar title="Custom field details" icon={ListChecks}>
      <div className="space-y-3">
        <MetadataDetailRow
          label="Name"
          editable={{
            value: field.name,
            editOnClick: true,
            showEditIcon: false,
            onSave: (value) => onUpdateField({ ...field, name: value.trim() })
          }}
        />
        <MetadataDetailRow
          label="Key"
          editable={{
            value: field.key,
            editOnClick: true,
            showEditIcon: false,
            onSave: (value) =>
              onUpdateResult(updateAssetCustomFieldKey(field, value))
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
              onUpdateField(updateAssetCustomFieldType(field, value))
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
              onUpdateField({
                ...field,
                required: value === "required"
              })
          }}
        />
        <MetadataDetailRow
          label="Default"
          editable={{
            value: getEditableDefaultValue(field),
            displayElement: () => summary.defaultValue,
            editElement: getDefaultValueEditor(field),
            editOnClick: true,
            showEditIcon: false,
            onSave: (value) =>
              onUpdateField(updateAssetCustomFieldDefaultValue(field, value))
          }}
        />
        <MetadataDetailRow label="Options" value={summary.optionCount} />
      </div>
    </MetadataSidebar>
  )
}

function getDefaultValueEditor(
  field: AssetCustomFieldDefinition
): EditElement<string> {
  if (field.type !== AssetCustomFieldType.Select) {
    return {
      type: "input",
      inputType: field.type === AssetCustomFieldType.Number ? "number" : "text"
    }
  }

  return {
    type: "select",
    options: getDefaultSelectOptions(field)
  }
}
