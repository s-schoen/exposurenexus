import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { ListChecks } from "lucide-react";

import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

import type { CustomFieldSummary } from "@/features/custom-fields/components/asset-custom-field-detail-content/helpers.ts";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
import type { ReactNode } from "react";

const DETAIL_CARD_CLASS = "border-border/60 bg-shell-panel shadow-(--shell-shadow)";
const FIELD_VALUE_CLASS =
  "rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground";

export function CustomFieldRequiredBadge({ required }: { required: boolean }) {
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
  );
}

export function CustomFieldOverviewCard({
  field,
  summary,
  titleAction,
}: {
  field: AssetCustomFieldDefinition;
  summary: CustomFieldSummary;
  titleAction?: ReactNode;
}) {
  return (
    <Card className={DETAIL_CARD_CLASS}>
      <CardHeader className="gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{titleAction}</div>
          <CustomFieldRequiredBadge required={field.required} />
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">{field.name}</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6">
              Asset metadata field definition used to capture additional registry information.
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
              value={summary.typeLabel}
              description="Value shape and validation rule"
            />
            <DetailHighlightCard
              label="Default"
              value={summary.defaultValue}
              description="Value applied when an asset has no override"
            />
            <DetailHighlightCard
              label="Options"
              value={summary.optionCount}
              description="Allowed values for select fields"
            />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

export function CustomFieldDefinitionCard({
  field,
  summary,
}: {
  field: AssetCustomFieldDefinition;
  summary: CustomFieldSummary;
}) {
  return (
    <Card className={DETAIL_CARD_CLASS}>
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-xl font-semibold">Definition</CardTitle>
            <CardDescription>General settings for this asset custom field.</CardDescription>
          </div>
          <Badge variant="outline" className="rounded-md">
            <ListChecks className="size-3" />
            {summary.typeLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <DefinitionValue label="Name" value={field.name} />
        <DefinitionValue label="Key" value={field.key} mono />
        <DefinitionValue label="Type" value={summary.typeLabel} />
        <DefinitionValue label="Default value" value={summary.defaultValue} />
      </CardContent>
    </Card>
  );
}

export function SelectOptionsCard({ field }: { field: AssetCustomFieldDefinition }) {
  if (field.type !== AssetCustomFieldType.Select) {
    return null;
  }

  return (
    <Card className={DETAIL_CARD_CLASS}>
      <CardHeader>
        <div className="space-y-2">
          <CardTitle className="text-xl font-semibold">Select options</CardTitle>
          <CardDescription>Values available when assigning this field to an asset.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {field.options.map((option) => (
          <div
            key={option.id}
            className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 md:grid-cols-2"
          >
            <DefinitionValue label="Value" value={option.value} mono />
            <DefinitionValue label="Label" value={option.label} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DefinitionValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className={mono ? `${FIELD_VALUE_CLASS} font-mono` : FIELD_VALUE_CLASS}>{value}</div>
    </div>
  );
}
