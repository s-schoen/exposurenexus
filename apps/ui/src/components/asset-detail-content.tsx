import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/types/model/asset-custom-field";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Plus, RotateCcw, Server, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
} from "@/api/asset.ts";
import { createListUsersQueryOptions } from "@/api/user.ts";
import { AssetIdentifierManager } from "@/components/asset-identifier-editor.tsx";
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx";
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { Inplace } from "@/components/inplace.tsx";
import { MetadataSidebar } from "@/components/metadata-sidebar/index.tsx";
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  UserLabel,
  createUserProfileById,
  formatUserProfileReference,
} from "@/components/user-label.tsx";
import { useAssetLifecycle } from "@/hooks/use-asset-lifecycle.ts";
import { formatAssetCustomFieldValue } from "@/lib/asset-custom-fields.ts";
import { capitalizeFirstLetter } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

import type { Asset, UpdateAsset } from "@exposurenexus/types/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  AssetCustomFieldValueLiteral,
} from "@exposurenexus/types/model/asset-custom-field";
import type { ReactNode } from "react";

interface AssetDetailContentProps {
  assetId: string;
  titleAction?: ReactNode;
}

const noOwnerValue = "__no_owner__";

export function getAssetCustomFieldDraftValue(field: AssetCustomFieldValue): string {
  return field.value === null ? "" : String(field.value);
}

export function createAssetCustomFieldValuePayload(
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

export function AssetDetailContent({ assetId, titleAction }: AssetDetailContentProps) {
  const assetLifecycle = useAssetLifecycle();
  const assetQueryOptions = createAssetByIDQueryOptions(assetId);
  const asset = useQuery(assetQueryOptions);
  const users = useQuery(createListUsersQueryOptions());
  const customFieldValuesQueryOptions = createAssetCustomFieldValuesQueryOptions(assetId);
  const availableCustomFieldDefinitionsQueryOptions =
    createAvailableAssetCustomFieldDefinitionsQueryOptions(assetId);
  const customFields = useQuery(customFieldValuesQueryOptions);
  const availableCustomFields = useQuery(availableCustomFieldDefinitionsQueryOptions);
  const userProfileById = useMemo(() => createUserProfileById(users.data), [users.data]);

  function AssetOwnerText({ assetData, className }: { assetData: Asset; className?: string }) {
    return (
      <UserLabel
        userId={assetData.ownerId}
        user={
          assetData.ownerId && users.isPending
            ? undefined
            : assetData.ownerId
              ? (userProfileById.get(assetData.ownerId) ?? null)
              : null
        }
        emptyLabel="No Owner"
        unknownLabel="Unknown Owner"
        className={className}
      />
    );
  }

  function getAssetOwnerEditValue(assetData: Asset) {
    return assetData.ownerId ?? noOwnerValue;
  }

  function AssetOwnerPicker({
    value,
    onCancel,
    onCommit,
  }: {
    value: string;
    onCancel: () => void;
    onCommit: (value: string) => void;
  }) {
    const [open, setOpen] = useState(false);
    const ownerId = value === noOwnerValue ? null : value;
    const ownerLabel =
      ownerId && users.isPending
        ? "Loading owner"
        : formatUserProfileReference(ownerId, userProfileById, {
            emptyLabel: "No Owner",
            unknownLabel: "Unknown Owner",
          });

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Asset owner"
              disabled={users.isPending}
              className="max-w-full min-w-36 justify-between"
            >
              <span className="min-w-0 truncate">{ownerLabel}</span>
            </Button>
          }
        />
        <PopoverContent align="end" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search owners..." />
            <CommandList>
              <CommandEmpty>No owners found</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={noOwnerValue}
                  onSelect={() => {
                    setOpen(false);
                    onCommit(noOwnerValue);
                  }}
                >
                  No Owner
                </CommandItem>
                {users.data?.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={`${user.displayName} ${user.username}`}
                    onSelect={() => {
                      setOpen(false);
                      onCommit(user.id);
                    }}
                  >
                    <div className="min-w-0">
                      <span className="block truncate">{user.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.username}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Cancel asset owner edit"
          title="Cancel"
          onClick={onCancel}
        >
          <X />
        </Button>
      </Popover>
    );
  }

  async function handleSaveAssetOwner(assetData: Asset, value: string) {
    const ownerId = value === noOwnerValue ? null : value;

    if (assetData.ownerId === ownerId) {
      return;
    }

    await assetLifecycle.updateAsset(assetId, { ownerId });
  }

  async function handleSaveAssetField(field: UpdateAsset) {
    await assetLifecycle.updateAsset(assetId, field);
  }

  async function handleAddAssetIdentifier(
    identifier: Parameters<typeof assetLifecycle.addAssetIdentifier>[1],
  ) {
    return await assetLifecycle.addAssetIdentifier(assetId, identifier);
  }

  async function handleUpdateAssetIdentifier(
    identifierId: string,
    identifier: Parameters<typeof assetLifecycle.updateAssetIdentifier>[2],
  ) {
    await assetLifecycle.updateAssetIdentifier(assetId, identifierId, identifier);
  }

  async function handleRemoveAssetIdentifier(identifierId: string) {
    await assetLifecycle.deleteAssetIdentifier(assetId, identifierId);
  }

  function formatAssetValue(value: string) {
    return capitalizeFirstLetter(value.replace(/([a-z])([A-Z])/gu, "$1 $2"));
  }

  async function handleSaveCustomFieldValue(field: AssetCustomFieldValue, value: string) {
    const payload = createAssetCustomFieldValuePayload(field, value);

    await assetLifecycle.updateAssetCustomFieldValues(
      assetId,
      createAssetCustomFieldValueReplacement(customFields.data ?? [], field.fieldId, payload),
    );
  }

  async function handleResetCustomFieldValue(field: AssetCustomFieldValue) {
    await assetLifecycle.resetAssetCustomFieldValues(
      assetId,
      createAssetCustomFieldValueReplacement(customFields.data ?? [], field.fieldId, null),
    );
  }

  async function handleAssignCustomField(field: AssetCustomFieldDefinition) {
    await assetLifecycle.assignAssetCustomField(assetId, [
      ...(customFields.data ?? []).map((customField) => customField.fieldId),
      field.id,
    ]);
  }

  async function handleDetachCustomField(field: AssetCustomFieldValue) {
    await assetLifecycle.detachAssetCustomField(
      assetId,
      (customFields.data ?? [])
        .map((customField) => customField.fieldId)
        .filter((fieldId) => fieldId !== field.fieldId),
    );
  }

  function AssetOverviewCard({ assetData }: { assetData: Asset }) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{titleAction}</div>
            <Badge variant="outline" className="rounded-md">
              <Server className="size-3" />
              {capitalizeFirstLetter(assetData.type)}
            </Badge>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {assetData.displayName}
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">
                Inventory record representing a tracked platform asset that can be linked to
                findings and vulnerability exposure.
              </CardDescription>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              <DetailHighlightCard
                label="Asset display name"
                value={assetData.displayName}
                description="Human-readable label for this asset"
              />
              <DetailHighlightCard
                label="Asset type"
                value={capitalizeFirstLetter(assetData.type)}
                description="Inventory classification for this asset"
              />
              <DetailHighlightCard
                label="Asset owner"
                value={<AssetOwnerText assetData={assetData} />}
                description="User profile responsible for findings on this asset"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  function AssetSidebar({ assetData }: { assetData: Asset }) {
    return (
      <MetadataSidebar title="Asset details" icon={Server}>
        <div className="space-y-3">
          <MetadataDetailRow
            label="Display name"
            editable={{
              value: assetData.displayName,
              onSave: (value) => handleSaveAssetField({ displayName: value }),
              editOnClick: true,
              showEditIcon: false,
            }}
          />
          <MetadataDetailRow
            label="Type"
            editable={{
              value: assetData.type,
              onSave: (value) => handleSaveAssetField({ type: value }),
              displayElement: (value) => formatAssetValue(value),
              editElement: {
                type: "select",
                options: Object.values(AssetType).map((value) => ({
                  label: formatAssetValue(value),
                  value,
                })),
              },
              editOnClick: true,
              showEditIcon: false,
            }}
          />
          <MetadataDetailRow
            label="Environment"
            editable={{
              value: assetData.environment,
              onSave: (value) => handleSaveAssetField({ environment: value }),
              displayElement: (value) => formatAssetValue(value),
              editElement: {
                type: "select",
                options: Object.values(AssetEnvironment).map((value) => ({
                  label: formatAssetValue(value),
                  value,
                })),
              },
              editOnClick: true,
              showEditIcon: false,
            }}
          />
          <MetadataDetailRow
            label="Lifecycle state"
            editable={{
              value: assetData.lifecycleState,
              onSave: (value) => handleSaveAssetField({ lifecycleState: value }),
              displayElement: (value) => formatAssetValue(value),
              editElement: {
                type: "select",
                options: Object.values(AssetLifecycleState).map((value) => ({
                  label: formatAssetValue(value),
                  value,
                })),
              },
              editOnClick: true,
              showEditIcon: false,
            }}
          />
          <MetadataDetailRow
            label="Owner"
            editable={{
              value: getAssetOwnerEditValue(assetData),
              onSave: (value) => handleSaveAssetOwner(assetData, value),
              displayElement: () => <AssetOwnerText assetData={assetData} />,
              editElement: {
                type: "custom",
                hideActions: true,
                render: ({ value, onCancel, onCommit }) => (
                  <AssetOwnerPicker value={value} onCancel={onCancel} onCommit={onCommit} />
                ),
              },
              editOnClick: true,
              showEditIcon: false,
            }}
          />
        </div>
        <Separator />
        <AssetIdentifierManager
          identifiers={assetData.identifiers}
          onAdd={handleAddAssetIdentifier}
          onUpdate={handleUpdateAssetIdentifier}
          onRemove={handleRemoveAssetIdentifier}
        />
        <Separator />
        <div className="space-y-3">
          <MetadataDetailRow label="Created" value={assetData.createdAt.toLocaleString()} />
          <MetadataDetailRow
            label="Created by"
            value={
              <UserLabel
                userId={assetData.createdBy}
                user={
                  users.isPending ? undefined : (userProfileById.get(assetData.createdBy) ?? null)
                }
                unknownLabel="Unknown User"
              />
            }
          />
          <MetadataDetailRow label="Updated" value={assetData.updatedAt.toLocaleString()} />
          <MetadataDetailRow
            label="Updated by"
            value={
              <UserLabel
                userId={assetData.updatedBy}
                user={
                  users.isPending ? undefined : (userProfileById.get(assetData.updatedBy) ?? null)
                }
                unknownLabel="Unknown User"
              />
            }
          />
        </div>
        <Separator />
        <AssetCustomFieldsSidebarSection
          availableCustomFields={availableCustomFields.data}
          customFields={customFields.data}
          isAvailablePending={availableCustomFields.isPending}
          isError={customFields.isError}
          isPending={customFields.isPending}
          onAssign={handleAssignCustomField}
          onDetach={handleDetachCustomField}
          onReset={handleResetCustomFieldValue}
          onSave={handleSaveCustomFieldValue}
        />
      </MetadataSidebar>
    );
  }

  return (
    <DetailQueryBoundary
      query={asset}
      title="Asset details"
      errorTitle="Unable to load asset"
      errorDescription="The selected asset could not be loaded."
      missingMessage="The API did not return an asset record."
    >
      {(assetData) => (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <AssetOverviewCard assetData={assetData} />
          </div>
          <AssetSidebar assetData={assetData} />
        </div>
      )}
    </DetailQueryBoundary>
  );
}

interface AssetCustomFieldsSidebarSectionProps {
  availableCustomFields?: Array<AssetCustomFieldDefinition>;
  customFields?: Array<AssetCustomFieldValue>;
  isAvailablePending: boolean;
  isError: boolean;
  isPending: boolean;
  onAssign: (field: AssetCustomFieldDefinition) => void | Promise<void>;
  onDetach: (field: AssetCustomFieldValue) => void | Promise<void>;
  onReset: (field: AssetCustomFieldValue) => void | Promise<void>;
  onSave: (field: AssetCustomFieldValue, value: string) => void | Promise<void>;
}

function AssetCustomFieldsSidebarSection({
  availableCustomFields,
  customFields,
  isAvailablePending,
  isError,
  isPending,
  onAssign,
  onDetach,
  onReset,
  onSave,
}: AssetCustomFieldsSidebarSectionProps) {
  if (isPending) {
    return (
      <div className="space-y-3" aria-label="Custom fields loading">
        <CustomFieldsSectionTitle
          availableCustomFields={availableCustomFields}
          isAvailablePending={isAvailablePending}
          onAssign={onAssign}
        />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <CustomFieldsSectionTitle
          availableCustomFields={availableCustomFields}
          isAvailablePending={isAvailablePending}
          onAssign={onAssign}
        />
        <Alert variant="destructive" className="px-3 py-2">
          <AlertCircle className="size-4" />
          <AlertTitle className="text-sm">Unable to load custom fields</AlertTitle>
          <AlertDescription className="text-xs">
            The asset details are still available.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!customFields || customFields.length === 0) {
    return (
      <div className="space-y-3">
        <CustomFieldsSectionTitle
          availableCustomFields={availableCustomFields}
          isAvailablePending={isAvailablePending}
          onAssign={onAssign}
        />
        <p className="text-sm text-muted-foreground">No custom fields</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CustomFieldsSectionTitle
        availableCustomFields={availableCustomFields}
        isAvailablePending={isAvailablePending}
        onAssign={onAssign}
      />
      {customFields.map((field) => (
        <AssetCustomFieldSidebarRow
          key={field.fieldId}
          field={field}
          onDetach={onDetach}
          onReset={onReset}
          onSave={onSave}
        />
      ))}
    </div>
  );
}

interface CustomFieldsSectionTitleProps {
  availableCustomFields?: Array<AssetCustomFieldDefinition>;
  isAvailablePending: boolean;
  onAssign: (field: AssetCustomFieldDefinition) => void | Promise<void>;
}

function CustomFieldsSectionTitle({
  availableCustomFields,
  isAvailablePending,
  onAssign,
}: CustomFieldsSectionTitleProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Custom fields
      </h3>
      <AssetCustomFieldAssignmentPicker
        availableCustomFields={availableCustomFields}
        isPending={isAvailablePending}
        onAssign={onAssign}
      />
    </div>
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
            size="icon-xs"
            aria-label="Add custom field"
            title="Add custom field"
            disabled={isPending || !hasAvailableFields}
          >
            <Plus />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search custom fields..." />
          <CommandList>
            <CommandEmpty>No custom fields available</CommandEmpty>
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

interface AssetCustomFieldSidebarRowProps {
  field: AssetCustomFieldValue;
  onDetach: (field: AssetCustomFieldValue) => void | Promise<void>;
  onReset: (field: AssetCustomFieldValue) => void | Promise<void>;
  onSave: (field: AssetCustomFieldValue, value: string) => void | Promise<void>;
}

function AssetCustomFieldSidebarRow({
  field,
  onDetach,
  onReset,
  onSave,
}: AssetCustomFieldSidebarRowProps) {
  const isAssetValue = field.source === AssetCustomFieldValueSource.Asset;
  const [isEditing, setIsEditing] = useState(false);

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
                  "text-muted-foreground": field.value === null,
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
        {!isEditing ? (
          <div className="flex shrink-0 items-center gap-1">
            {isAssetValue ? (
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
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${field.name}`}
              title="Remove custom field"
              onClick={() => onDetach(field)}
            >
              <X />
            </Button>
          </div>
        ) : null}
      </div>
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
