import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { useQuery } from "@tanstack/react-query";
import { Activity, Globe, Plus, RotateCcw, Shapes, UserRound, X } from "lucide-react";
import { useState } from "react";

import { Inplace } from "@/components/inplace.tsx";
import { DetailLayout } from "@/components/properties-panel/detail-layout.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesAuditLines,
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
} from "@/components/properties-panel/properties-panel.tsx";
import { PropertySelect } from "@/components/properties-panel/property-select.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AssetIdentifiersSection } from "@/features/assets/components/asset-identifiers-section.tsx";
import { AssetTypeIcon } from "@/features/assets/components/asset-type-icon.tsx";
import { useAssetLifecycle } from "@/features/assets/hooks/use-asset-lifecycle.ts";
import { formatAssetCustomFieldValue } from "@/features/assets/lib/asset-custom-fields.ts";
import { formatAssetType } from "@/features/assets/lib/asset-type.ts";
import {
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
} from "@/features/assets/queries/assets.ts";
import {
  UserAvatar,
  createListUsersQueryOptions,
  createUserProfileById,
  formatUserProfileReference,
  getUserProfileDisplayName,
} from "@/features/users";
import { capitalizeFirstLetter } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

import type { PropertyOption } from "@/components/properties-panel/property-select.tsx";
import type { Asset, UpdateAsset } from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  AssetCustomFieldValueLiteral,
} from "@exposurenexus/contracts/model/asset-custom-field";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { ReactNode } from "react";

const noOwnerValue = "__no_owner__";

function formatAssetValue(value: string) {
  return capitalizeFirstLetter(value.replace(/([a-z])([A-Z])/gu, "$1 $2"));
}

const typeOptions: Array<PropertyOption<AssetType>> = Object.values(AssetType).map((type) => ({
  value: type,
  label: formatAssetType(type),
  icon: <AssetTypeIcon type={type} decorative />,
}));

const environmentOptions: Array<PropertyOption<AssetEnvironment>> = Object.values(
  AssetEnvironment,
).map((environment) => ({ value: environment, label: formatAssetValue(environment) }));

const lifecycleStateOptions: Array<PropertyOption<AssetLifecycleState>> = Object.values(
  AssetLifecycleState,
).map((state) => ({ value: state, label: formatAssetValue(state) }));

function getAssetCustomFieldDraftValue(field: AssetCustomFieldValue): string {
  return field.value === null ? "" : String(field.value);
}

function createAssetCustomFieldValuePayload(
  field: AssetCustomFieldValue,
  value: string,
): AssetCustomFieldValueLiteral {
  if (field.type === AssetCustomFieldType.Number) {
    const trimmed = value.trim();
    return trimmed === "" ? null : Number(trimmed);
  }

  return value;
}

function createAssetCustomFieldValueReplacement(
  fields: Array<AssetCustomFieldValue>,
  changedFieldId: string,
  value: AssetCustomFieldValueLiteral,
) {
  return fields.map((field) => ({
    fieldId: field.fieldId,
    value:
      field.fieldId === changedFieldId
        ? value
        : field.source === AssetCustomFieldValueSource.Asset
          ? field.value
          : null,
  }));
}

function decorativeAvatar(userId: string | null, user: UserProfile | null | undefined) {
  return (
    <span aria-hidden="true" className="flex shrink-0">
      <UserAvatar userId={userId} user={user} />
    </span>
  );
}

function ownerOptions(
  asset: Asset,
  users: Array<UserProfile> | undefined,
): Array<PropertyOption<string>> {
  const options: Array<PropertyOption<string>> = [
    { value: noOwnerValue, label: "No Owner", icon: decorativeAvatar(null, null) },
    ...(users ?? []).map((user) => ({
      value: user.id,
      label: getUserProfileDisplayName(user),
      icon: decorativeAvatar(user.id, user),
    })),
  ];

  // Keep the current owner pickable while users load, or when it is no longer listed.
  if (asset.ownerId && !options.some(({ value }) => value === asset.ownerId)) {
    options.push({
      value: asset.ownerId,
      label: users ? "Unknown Owner" : "Loading…",
      icon: decorativeAvatar(asset.ownerId, users ? null : undefined),
    });
  }

  return options;
}

function AssetPropertiesPanel({ asset }: { asset: Asset }) {
  const assetLifecycle = useAssetLifecycle();
  const users = useQuery(createListUsersQueryOptions());
  const userProfileById = createUserProfileById(users.data);
  const userName = (userId: string) =>
    users.isPending ? "…" : formatUserProfileReference(userId, userProfileById);

  const update = async (field: UpdateAsset) =>
    (await assetLifecycle.updateAsset(asset.id, field)) !== null;

  return (
    <PropertiesPanel
      footer={
        <PropertiesAuditLines
          createdBy={userName(asset.createdBy)}
          createdAt={asset.createdAt}
          updatedBy={userName(asset.updatedBy)}
          updatedAt={asset.updatedAt}
        />
      }
    >
      <PropertyGroup>
        <PropertyRow icon={Shapes} label="Type">
          <PropertySelect
            value={asset.type}
            options={typeOptions}
            searchPlaceholder="Search types…"
            onCommit={(type) => update({ type })}
          />
        </PropertyRow>
        <PropertyRow icon={UserRound} label="Owner">
          <PropertySelect
            value={asset.ownerId ?? noOwnerValue}
            options={ownerOptions(asset, users.data)}
            searchPlaceholder="Search users…"
            onCommit={(ownerId) => update({ ownerId: ownerId === noOwnerValue ? null : ownerId })}
          />
        </PropertyRow>
        <PropertyRow icon={Globe} label="Environment">
          <PropertySelect
            value={asset.environment}
            options={environmentOptions}
            searchPlaceholder="Search environments…"
            onCommit={(environment) => update({ environment })}
          />
        </PropertyRow>
        <PropertyRow icon={Activity} label="Lifecycle">
          <PropertySelect
            value={asset.lifecycleState}
            options={lifecycleStateOptions}
            searchPlaceholder="Search states…"
            onCommit={(lifecycleState) => update({ lifecycleState })}
          />
        </PropertyRow>
      </PropertyGroup>
    </PropertiesPanel>
  );
}

function AssetTitle({ asset }: { asset: Asset }) {
  const assetLifecycle = useAssetLifecycle();

  return (
    <h2 className="min-w-0 text-2xl leading-tight font-semibold break-words text-foreground">
      <Inplace
        value={asset.displayName}
        onSave={async (displayName) => {
          await assetLifecycle.updateAsset(asset.id, { displayName });
        }}
        displayElement={(displayName) => <span>{displayName}</span>}
        editOnClick
        showEditIcon={false}
      />
    </h2>
  );
}

function AssetCustomFieldsSection({ asset }: { asset: Asset }) {
  const assetLifecycle = useAssetLifecycle();
  const customFields = useQuery(createAssetCustomFieldValuesQueryOptions(asset.id));
  const availableCustomFields = useQuery(
    createAvailableAssetCustomFieldDefinitionsQueryOptions(asset.id),
  );
  const fields = customFields.data ?? [];

  async function handleSave(field: AssetCustomFieldValue, value: string) {
    await assetLifecycle.updateAssetCustomFieldValues(
      asset.id,
      createAssetCustomFieldValueReplacement(
        fields,
        field.fieldId,
        createAssetCustomFieldValuePayload(field, value),
      ),
    );
  }

  async function handleReset(field: AssetCustomFieldValue) {
    await assetLifecycle.resetAssetCustomFieldValues(
      asset.id,
      createAssetCustomFieldValueReplacement(fields, field.fieldId, null),
    );
  }

  async function handleAssign(field: AssetCustomFieldDefinition) {
    await assetLifecycle.assignAssetCustomField(asset.id, [
      ...fields.map((customField) => customField.fieldId),
      field.id,
    ]);
  }

  async function handleDetach(field: AssetCustomFieldValue) {
    await assetLifecycle.detachAssetCustomField(
      asset.id,
      fields.map((customField) => customField.fieldId).filter((id) => id !== field.fieldId),
    );
  }

  let content: ReactNode;
  if (customFields.isPending) {
    content = (
      <div className="flex flex-col gap-2" aria-label="Custom fields loading">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-3/4" />
      </div>
    );
  } else if (customFields.isError) {
    content = <p className="text-13 text-destructive">Unable to load custom fields.</p>;
  } else if (fields.length === 0) {
    content = <p className="text-13 text-subtle-foreground">No custom fields are assigned.</p>;
  } else {
    content = (
      <dl className="flex flex-col">
        {fields.map((field) => (
          <AssetCustomFieldRow
            key={field.fieldId}
            field={field}
            onDetach={handleDetach}
            onReset={handleReset}
            onSave={handleSave}
          />
        ))}
      </dl>
    );
  }

  return (
    <DetailSection
      title="Custom fields"
      count={customFields.data?.length}
      action={
        <AssetCustomFieldAssignmentPicker
          availableCustomFields={availableCustomFields.data}
          isPending={availableCustomFields.isPending}
          onAssign={handleAssign}
        />
      }
    >
      {content}
    </DetailSection>
  );
}

interface AssetCustomFieldAssignmentPickerProps {
  availableCustomFields?: Array<AssetCustomFieldDefinition>;
  isPending: boolean;
  onAssign: (field: AssetCustomFieldDefinition) => void | Promise<void>;
}

function AssetCustomFieldAssignmentPicker({
  availableCustomFields = [],
  isPending,
  onAssign,
}: AssetCustomFieldAssignmentPickerProps) {
  const [open, setOpen] = useState(false);
  const hasAvailableFields = availableCustomFields.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add custom field"
            title="Add custom field"
            disabled={isPending || !hasAvailableFields}
          >
            <Plus strokeWidth={1.5} />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 gap-0 p-0">
        <Command>
          <CommandInput aria-label="Search custom fields" placeholder="Search custom fields…" />
          <CommandList>
            <CommandEmpty>No custom fields available.</CommandEmpty>
            <CommandGroup>
              {availableCustomFields.map((field) => (
                <CommandItem
                  key={field.id}
                  value={`${field.name} ${field.key}`}
                  onSelect={() => {
                    setOpen(false);
                    void onAssign(field);
                  }}
                >
                  <div className="min-w-0">
                    <span className="block truncate">{field.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {field.key} · {capitalizeFirstLetter(field.type)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface AssetCustomFieldRowProps {
  field: AssetCustomFieldValue;
  onDetach: (field: AssetCustomFieldValue) => void | Promise<void>;
  onReset: (field: AssetCustomFieldValue) => void | Promise<void>;
  onSave: (field: AssetCustomFieldValue, value: string) => void | Promise<void>;
}

function AssetCustomFieldRow({ field, onDetach, onReset, onSave }: AssetCustomFieldRowProps) {
  const isAssetValue = field.source === AssetCustomFieldValueSource.Asset;
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="-mx-2 flex min-h-9 items-center gap-3 rounded-md px-2 transition-colors duration-100 hover:bg-accent">
      <dt className="w-32 shrink-0 truncate text-13 text-muted-foreground">{field.name}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2 text-13 text-foreground">
        <div className="min-w-0 flex-1">
          <Inplace
            value={getAssetCustomFieldDraftValue(field)}
            onSave={(value) => onSave(field, value)}
            displayElement={() => (
              <span
                className={cn("block truncate", {
                  "text-subtle-foreground": field.value === null,
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
        {!isEditing && (
          <div className="flex shrink-0 items-center gap-0.5">
            {isAssetValue && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Reset ${field.name}`}
                title="Reset to default"
                onClick={() => void onReset(field)}
              >
                <RotateCcw strokeWidth={1.5} />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${field.name}`}
              title="Remove custom field"
              onClick={() => void onDetach(field)}
            >
              <X strokeWidth={1.5} />
            </Button>
          </div>
        )}
      </dd>
    </div>
  );
}

function getCustomFieldEditElement(field: AssetCustomFieldValue) {
  if (field.type === AssetCustomFieldType.Select) {
    return {
      type: "select" as const,
      options: field.options.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    };
  }

  return {
    type: "input" as const,
    inputType: field.type === AssetCustomFieldType.Number ? ("number" as const) : "text",
  };
}

interface AssetDetailContentProps {
  asset: Asset;
  /** The findings on the asset. The findings feature renders them, so the route hands them in. */
  findingsSection?: ReactNode;
}

export function AssetDetailContent({ asset, findingsSection }: AssetDetailContentProps) {
  const assetLifecycle = useAssetLifecycle();

  return (
    <DetailLayout
      header={<AssetTitle asset={asset} />}
      panel={<AssetPropertiesPanel asset={asset} />}
    >
      <AssetIdentifiersSection
        identifiers={asset.identifiers}
        onAdd={(identifier) => assetLifecycle.addAssetIdentifier(asset.id, identifier)}
        onUpdate={(identifierId, identifier) =>
          assetLifecycle.updateAssetIdentifier(asset.id, identifierId, identifier)
        }
        onRemove={(identifierId) => assetLifecycle.deleteAssetIdentifier(asset.id, identifierId)}
      />
      <AssetCustomFieldsSection asset={asset} />
      {findingsSection}
    </DetailLayout>
  );
}
