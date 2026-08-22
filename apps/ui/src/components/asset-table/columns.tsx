import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";

import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx";
import { UserLabel, formatUserProfileReference } from "@/components/user-label.tsx";
import { formatAssetCustomFieldValue } from "@/lib/asset-custom-fields.ts";
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

function createEnumFilterOptions<T extends string>(values: ReadonlyArray<T>) {
  return values.map((value) => ({
    label: capitalizeFirstLetter(value),
    value,
  }));
}

function createBaseColumns(
  userProfileById: Map<string, UserProfile>,
  usersLoading = false,
): Array<DataTableColumnDef<AssetWithCustomFields>> {
  return [
    {
      id: "displayName",
      accessorKey: "displayName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Display name" />,
      meta: {
        label: "Display name",
      },
    },
    {
      id: "identifiers",
      accessorFn: (asset) => asset.identifiers.map((identifier) => identifier.value).join(" "),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Identifiers" />,
      cell: ({ row }) => {
        const identifiers = row.original.identifiers;

        if (identifiers.length === 0) {
          return <span className="text-muted-foreground">No identifiers</span>;
        }

        return (
          <div className="max-w-80 space-y-0.5">
            {identifiers.slice(0, 2).map((identifier) => (
              <span
                key={identifier.id}
                className="block truncate font-mono text-xs"
                title={identifier.value}
              >
                {identifier.value}
              </span>
            ))}
            {identifiers.length > 2 && (
              <span className="block text-xs text-muted-foreground">
                +{identifiers.length - 2} more
              </span>
            )}
          </div>
        );
      },
      meta: {
        label: "Identifiers",
      },
    },
    {
      id: "type",
      accessorKey: "type",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => {
        return <span>{capitalizeFirstLetter(row.getValue("type"))}</span>;
      },
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(String(row.getValue("type")));
      },
      meta: {
        label: "Type",
        filterVariant: "select",
        options: createEnumFilterOptions(Object.values(AssetType)),
      },
    },
    {
      id: "environment",
      accessorKey: "environment",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Environment" />,
      cell: ({ row }) => {
        return <span>{capitalizeFirstLetter(row.getValue("environment"))}</span>;
      },
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(String(row.getValue("environment")));
      },
      meta: {
        label: "Environment",
        filterVariant: "select",
        options: createEnumFilterOptions(Object.values(AssetEnvironment)),
      },
    },
    {
      id: "lifecycleState",
      accessorKey: "lifecycleState",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lifecycle state" />,
      cell: ({ row }) => {
        return <span>{capitalizeFirstLetter(row.getValue("lifecycleState"))}</span>;
      },
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(String(row.getValue("lifecycleState")));
      },
      meta: {
        label: "Lifecycle state",
        filterVariant: "select",
        options: createEnumFilterOptions(Object.values(AssetLifecycleState)),
      },
    },
    {
      id: "ownerId",
      accessorFn: (asset) =>
        formatUserProfileReference(asset.ownerId, userProfileById, {
          emptyLabel: "No Owner",
          unknownLabel: "Unknown Owner",
        }),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Owner" />,
      cell: ({ row }) => (
        <UserLabel
          userId={row.original.ownerId}
          user={
            row.original.ownerId && usersLoading
              ? undefined
              : row.original.ownerId
                ? (userProfileById.get(row.original.ownerId) ?? null)
                : null
          }
          emptyLabel="No Owner"
          unknownLabel="Unknown Owner"
        />
      ),
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.original.ownerId ?? ASSET_OWNERLESS_FILTER_VALUE);
      },
      meta: {
        label: "Owner",
        filterVariant: "select",
        options: [
          { label: "No owner", value: ASSET_OWNERLESS_FILTER_VALUE },
          ...[...userProfileById.values()]
            .sort((left, right) => left.displayName.localeCompare(right.displayName))
            .map((user) => ({ label: user.displayName, value: user.id })),
        ],
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
    header: ({ column }) => <DataTableColumnHeader column={column} title={definition.name} />,
    cell: ({ getValue }) => {
      const value = getValue<string>();

      return <span className={value === "None" ? "text-muted-foreground" : ""}>{value}</span>;
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

export function createAssetTableColumns(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
  userProfileById: Map<string, UserProfile> = new Map(),
  usersLoading = false,
): Array<DataTableColumnDef<AssetWithCustomFields>> {
  return [
    ...createBaseColumns(userProfileById, usersLoading),
    ...customFieldDefinitions.map((definition) => createCustomFieldColumn(definition)),
  ];
}
