import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { Activity, Fingerprint, Layers, ShieldAlert, Tag, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { AssetTypeIcon } from "@/features/assets/components/asset-type-icon.tsx";
import { formatAssetCustomFieldValue } from "@/features/assets/lib/asset-custom-fields.ts";
import { formatAssetType } from "@/features/assets/lib/asset-type.ts";
import { UserLabel, formatUserProfileReference } from "@/features/users";
import { capitalizeFirstLetter } from "@/lib/format.ts";

import type { DataTableColumnDef } from "@/components/data-table/types.ts";
import type { AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const emptyCustomFieldFilterValue = "__empty__";

export function getAssetCustomFieldColumnId(fieldId: string) {
  return `custom-field:${fieldId}`;
}

export const ASSET_OWNERLESS_FILTER_VALUE = "none";

/** Each asset's number of findings, keyed by asset id; missing assets have none. */
export type FindingCountByAssetId = Readonly<Partial<Record<string, number>>>;

function createEnumFilterOptions<T extends string>(values: ReadonlyArray<T>) {
  return values.map((value) => ({
    label: capitalizeFirstLetter(value),
    value,
  }));
}

function OwnerChip({
  ownerId,
  userProfileById,
  usersLoading,
}: {
  ownerId: string | null;
  userProfileById: Map<string, UserProfile>;
  usersLoading: boolean;
}) {
  return (
    <Badge variant="property" title="Owner">
      <UserRound strokeWidth={1.5} aria-hidden="true" />
      <span className="max-w-40 truncate">
        <UserLabel
          userId={ownerId}
          user={
            ownerId && usersLoading
              ? undefined
              : ownerId
                ? (userProfileById.get(ownerId) ?? null)
                : null
          }
          emptyLabel="No owner"
          unknownLabel="Unknown owner"
        />
      </span>
    </Badge>
  );
}

function IdentifiersChip({ identifiers }: { identifiers: AssetWithCustomFields["identifiers"] }) {
  if (identifiers.length === 0) {
    return null;
  }

  return (
    <Badge variant="property" title={identifiers.map((identifier) => identifier.value).join("\n")}>
      <Fingerprint strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">Identifiers</span>
      <span className="max-w-48 truncate">{identifiers[0].value}</span>
      {identifiers.length > 1 && (
        <span className="text-muted-foreground tabular-nums">+{identifiers.length - 1}</span>
      )}
    </Badge>
  );
}

function createBaseColumns(
  findingCountByAssetId: FindingCountByAssetId,
  userProfileById: Map<string, UserProfile>,
  usersLoading = false,
): Array<DataTableColumnDef<AssetWithCustomFields>> {
  return [
    {
      id: "typeIcon",
      accessorFn: (asset) => asset.type,
      cell: ({ row }) => <AssetTypeIcon type={row.original.type} />,
      enableColumnFilter: false,
      enableGlobalFilter: false,
      enableGrouping: false,
      enableHiding: false,
      enableSorting: false,
      meta: { placement: "leading" },
    },
    {
      id: "displayName",
      accessorKey: "displayName",
      cell: ({ row }) => row.original.displayName,
      enableColumnFilter: false,
      enableHiding: false,
      meta: { label: "Display name", placement: "title" },
    },
    {
      id: "type",
      accessorKey: "type",
      cell: ({ row }) => (
        <Badge variant="property" title="Type">
          <AssetTypeIcon type={row.original.type} decorative />
          {formatAssetType(row.original.type)}
        </Badge>
      ),
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.original.type);
      },
      meta: {
        label: "Type",
        placement: "property",
        filterVariant: "select",
        options: Object.values(AssetType).map((type) => ({
          label: formatAssetType(type),
          value: type,
          icon: <AssetTypeIcon type={type} decorative />,
        })),
      },
    },
    {
      id: "ownerId",
      accessorFn: (asset) =>
        formatUserProfileReference(asset.ownerId, userProfileById, {
          emptyLabel: "No owner",
          unknownLabel: "Unknown owner",
        }),
      cell: ({ row }) => (
        <OwnerChip
          ownerId={row.original.ownerId}
          userProfileById={userProfileById}
          usersLoading={usersLoading}
        />
      ),
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.original.ownerId ?? ASSET_OWNERLESS_FILTER_VALUE);
      },
      meta: {
        label: "Owner",
        placement: "property",
        filterVariant: "select",
        options: [
          { label: "No owner", value: ASSET_OWNERLESS_FILTER_VALUE },
          ...[...userProfileById.values()]
            .sort((left, right) => left.displayName.localeCompare(right.displayName))
            .map((user) => ({ label: user.displayName, value: user.id })),
        ],
      },
    },
    {
      id: "findingCount",
      accessorFn: (asset) => findingCountByAssetId[asset.id] ?? 0,
      cell: ({ getValue }) => (
        <Badge variant="property" title="Findings">
          <ShieldAlert strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Findings</span>
          {getValue<number>()}
        </Badge>
      ),
      enableColumnFilter: false,
      enableGlobalFilter: false,
      enableGrouping: false,
      meta: { label: "Findings", placement: "property" },
    },
    {
      id: "identifiers",
      accessorFn: (asset) => asset.identifiers.map((identifier) => identifier.value).join(" "),
      cell: ({ row }) => <IdentifiersChip identifiers={row.original.identifiers} />,
      enableColumnFilter: false,
      enableGrouping: false,
      meta: { label: "Identifiers", placement: "property" },
    },
    {
      id: "environment",
      accessorKey: "environment",
      cell: ({ row }) => (
        <Badge variant="property" title="Environment">
          <Layers strokeWidth={1.5} aria-hidden="true" />
          {capitalizeFirstLetter(row.original.environment)}
        </Badge>
      ),
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.original.environment);
      },
      meta: {
        label: "Environment",
        placement: "property",
        filterVariant: "select",
        options: createEnumFilterOptions(Object.values(AssetEnvironment)),
      },
    },
    {
      id: "lifecycleState",
      accessorKey: "lifecycleState",
      cell: ({ row }) => (
        <Badge variant="property" title="Lifecycle state">
          <Activity strokeWidth={1.5} aria-hidden="true" />
          {capitalizeFirstLetter(row.original.lifecycleState)}
        </Badge>
      ),
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.original.lifecycleState);
      },
      meta: {
        label: "Lifecycle state",
        placement: "property",
        filterVariant: "select",
        options: createEnumFilterOptions(Object.values(AssetLifecycleState)),
      },
    },
  ];
}

function createCustomFieldColumn(
  definition: AssetCustomFieldDefinition,
): DataTableColumnDef<AssetWithCustomFields> {
  const columnId = getAssetCustomFieldColumnId(definition.id);
  const filterVariant = (() => {
    switch (definition.type) {
      case AssetCustomFieldType.Number:
        return "number" as const;
      case AssetCustomFieldType.Select:
        return "select" as const;
      case AssetCustomFieldType.Text:
        return "text" as const;
    }
  })();

  return {
    id: columnId,
    accessorFn: (asset) =>
      formatAssetCustomFieldValue(
        asset.customFields.find((field) => field.fieldId === definition.id),
      ),
    cell: ({ row, getValue }) => {
      const field = row.original.customFields.find((item) => item.fieldId === definition.id);

      if (!field || field.value === null) {
        return null;
      }

      return (
        <Badge variant="property" title={definition.name}>
          <Tag strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">{definition.name}</span>
          <span className="max-w-40 truncate">{getValue<string>()}</span>
        </Badge>
      );
    },
    filterFn: (row, _columnId, filterValue: Array<string> | string) => {
      const value = row.original.customFields.find((field) => field.fieldId === definition.id);

      switch (definition.type) {
        case AssetCustomFieldType.Number: {
          if (typeof filterValue !== "string" || !filterValue.trim()) {
            return true;
          }

          const parsedFilterValue = Number(filterValue);

          return (
            Number.isFinite(parsedFilterValue) &&
            typeof value?.value === "number" &&
            value.value === parsedFilterValue
          );
        }
        case AssetCustomFieldType.Select: {
          if (!Array.isArray(filterValue) || filterValue.length === 0) {
            return true;
          }

          const resolvedValue =
            value?.value === null || typeof value === "undefined"
              ? emptyCustomFieldFilterValue
              : String(value.value);

          return filterValue.includes(resolvedValue);
        }
        case AssetCustomFieldType.Text: {
          if (typeof filterValue !== "string" || !filterValue.trim()) {
            return true;
          }

          return formatAssetCustomFieldValue(value)
            .toLocaleLowerCase()
            .includes(filterValue.toLocaleLowerCase());
        }
      }
    },
    meta: {
      label: definition.name,
      placement: "property",
      filterVariant,
      ...(definition.type === AssetCustomFieldType.Select
        ? {
            options: [
              { label: "None", value: emptyCustomFieldFilterValue },
              ...definition.options.map((option) => ({
                label: option.label,
                value: option.value,
              })),
            ],
          }
        : {}),
    },
  };
}

export function createAssetColumns(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
  findingCountByAssetId: FindingCountByAssetId = {},
  userProfileById: Map<string, UserProfile> = new Map(),
  usersLoading = false,
): Array<DataTableColumnDef<AssetWithCustomFields>> {
  return [
    ...createBaseColumns(findingCountByAssetId, userProfileById, usersLoading),
    ...customFieldDefinitions.map((definition) => createCustomFieldColumn(definition)),
  ];
}
