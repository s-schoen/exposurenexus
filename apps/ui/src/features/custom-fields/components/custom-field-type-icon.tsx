import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { Hash, ListChecks, TextCursorInput } from "lucide-react";

import { formatCustomFieldType } from "@/features/custom-fields/lib/custom-field-type.ts";
import { cn } from "@/lib/utils.ts";

import type { LucideIcon } from "lucide-react";

const customFieldTypeIcons = {
  [AssetCustomFieldType.Text]: TextCursorInput,
  [AssetCustomFieldType.Number]: Hash,
  [AssetCustomFieldType.Select]: ListChecks,
} satisfies Record<AssetCustomFieldType, LucideIcon>;

interface CustomFieldTypeIconProps {
  type: AssetCustomFieldType;
  /** Hide the icon from assistive technology when a visible label sits next to it. */
  decorative?: boolean;
  className?: string;
}

export function CustomFieldTypeIcon({
  type,
  decorative = false,
  className,
}: CustomFieldTypeIconProps) {
  const Icon = customFieldTypeIcons[type];
  const a11yProps = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": formatCustomFieldType(type) };

  return (
    <Icon
      strokeWidth={1.5}
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      {...a11yProps}
    />
  );
}
