import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { Key, Shapes } from "lucide-react";

import { DetailLayout } from "@/components/properties-panel/detail-layout.tsx";
import { DetailField, DetailFields } from "@/components/properties-panel/detail-rows.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
  PropertyValue,
} from "@/components/properties-panel/properties-panel.tsx";
import { CustomFieldRequiredLabel } from "@/features/custom-fields/components/custom-field-required-label.tsx";
import { CustomFieldTypeIcon } from "@/features/custom-fields/components/custom-field-type-icon.tsx";
import { formatCustomFieldType } from "@/features/custom-fields/lib/custom-field-type.ts";

import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

/** The stored default value for display, with select values resolved to their option labels. */
function formatDefaultValue(field: AssetCustomFieldDefinition): string | null {
  if (field.defaultValue === null) {
    return null;
  }

  if (field.type === AssetCustomFieldType.Select) {
    const option = field.options.find((candidate) => candidate.value === field.defaultValue);
    return option?.label ?? field.defaultValue;
  }

  return String(field.defaultValue);
}

function CustomFieldPropertiesPanel({ field }: { field: AssetCustomFieldDefinition }) {
  return (
    <PropertiesPanel>
      <PropertyGroup>
        <PropertyRow icon={Key} label="Key">
          <PropertyValue>
            <span className="truncate font-mono text-xs">{field.key}</span>
          </PropertyValue>
        </PropertyRow>
        <PropertyRow icon={Shapes} label="Type">
          <PropertyValue>
            <CustomFieldTypeIcon type={field.type} decorative />
            {formatCustomFieldType(field.type)}
          </PropertyValue>
        </PropertyRow>
      </PropertyGroup>
    </PropertiesPanel>
  );
}

function RulesSection({ field }: { field: AssetCustomFieldDefinition }) {
  const defaultValue = formatDefaultValue(field);

  return (
    <DetailSection title="Rules">
      <DetailFields>
        <DetailField label="Required">
          <CustomFieldRequiredLabel required={field.required} />
        </DetailField>
        <DetailField label="Default value">
          {defaultValue === null ? (
            <span className="text-subtle-foreground">None</span>
          ) : (
            <span className="min-w-0 break-words">{defaultValue}</span>
          )}
        </DetailField>
      </DetailFields>
    </DetailSection>
  );
}

function AllowedValuesSection({ field }: { field: AssetCustomFieldDefinition }) {
  if (field.type !== AssetCustomFieldType.Select) {
    return null;
  }

  return (
    <DetailSection title="Allowed values" count={field.options.length}>
      <DetailFields label="Allowed values">
        {field.options.map((option) => (
          <DetailField key={option.id} label={option.label}>
            <span className="min-w-0 truncate font-mono text-xs">{option.value}</span>
          </DetailField>
        ))}
      </DetailFields>
    </DetailSection>
  );
}

interface AssetCustomFieldDetailContentProps {
  field: AssetCustomFieldDefinition;
}

export function AssetCustomFieldDetailContent({ field }: AssetCustomFieldDetailContentProps) {
  return (
    <DetailLayout
      header={
        <h2 className="text-2xl leading-tight font-semibold break-words text-foreground">
          {field.name}
        </h2>
      }
      panel={<CustomFieldPropertiesPanel field={field} />}
    >
      <RulesSection field={field} />
      <AllowedValuesSection field={field} />
    </DetailLayout>
  );
}
