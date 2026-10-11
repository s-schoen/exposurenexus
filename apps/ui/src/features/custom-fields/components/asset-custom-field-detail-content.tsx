import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { Key, Shapes } from "lucide-react";

import { DetailLayout } from "@/components/properties-panel/detail-layout.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
  PropertyValue,
} from "@/components/properties-panel/properties-panel.tsx";
import { PropertyTray, PropertyTrayRow } from "@/components/properties-panel/property-tray.tsx";
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
      <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-13">
        <dt className="text-muted-foreground">Required</dt>
        <dd className="text-foreground">{field.required ? "Yes" : "No"}</dd>
        <dt className="text-muted-foreground">Default value</dt>
        <dd className={defaultValue === null ? "text-subtle-foreground" : "text-foreground"}>
          {defaultValue ?? "None"}
        </dd>
      </dl>
    </DetailSection>
  );
}

function AllowedValuesSection({ field }: { field: AssetCustomFieldDefinition }) {
  if (field.type !== AssetCustomFieldType.Select) {
    return null;
  }

  return (
    <DetailSection title="Allowed values" count={field.options.length}>
      <PropertyTray label="Allowed values">
        {field.options.map((option) => (
          <PropertyTrayRow
            key={option.id}
            trailing={
              <span className="font-mono text-xs text-muted-foreground">{option.value}</span>
            }
          >
            <span className="truncate">{option.label}</span>
          </PropertyTrayRow>
        ))}
      </PropertyTray>
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
