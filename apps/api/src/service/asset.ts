import {
  type Asset,
  type AssetIdentifier,
  type AssetIdentifierRecord,
  type AssetWithCustomFields,
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
  type CreateAsset,
  type CreateAssetIdentifier,
  type UpdateAsset,
  type UpdateAssetIdentifier,
  validateAssetIdentifier,
} from "@exposurenexus/types/model/asset";
import { type AssetCustomFieldValue } from "@exposurenexus/types/model/asset-custom-field";

import {
  createDomainEventEmitter,
  type AssetEventPayloads,
  type DomainEventContext,
  type DomainEventEmitter,
  type EventSubjects,
} from "../lib/eventbus/events/index.js";
import { ApplicationError, isApplicationError } from "./application-error.js";
import { isConflictError, isForeignKeyError } from "./errors.js";

import type { AssetListOptions, AssetRepository } from "../repository/asset.js";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { Logger } from "pino";

interface AssetCustomFieldProjectionReader {
  listEffectiveValuesForAssets(
    assetIds: readonly string[],
  ): Promise<Map<string, AssetCustomFieldValue[]>>;
}

function assetSnapshotsEqual(
  previous: AssetWithCustomFields,
  current: AssetWithCustomFields,
): boolean {
  return JSON.stringify(previous) === JSON.stringify(current);
}

function normalizeDisplayName(displayName: string): string {
  const normalized = displayName.trim();
  if (normalized.length === 0 || normalized.length > 255) {
    throw new ApplicationError({
      code: "asset.display_name_invalid",
      kind: "validation",
      message: "asset display name must contain 1 to 255 characters",
      details: { displayName },
    });
  }

  return normalized;
}

function identifierKey(identifier: Pick<AssetIdentifier, "type" | "namespace" | "value">): string {
  return JSON.stringify([identifier.type, identifier.namespace, identifier.value]);
}

function normalizeIdentifier(input: unknown): AssetIdentifier {
  const result = validateAssetIdentifier(input);
  if (!result.success) {
    throw new ApplicationError({
      code: "asset.identifier_invalid",
      kind: "validation",
      message: "asset identifier is invalid",
      details: { issues: result.issues },
    });
  }

  return result.data;
}

function normalizeIdentifiers(inputs: readonly unknown[]): AssetIdentifier[] {
  const normalized: AssetIdentifier[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    const identifier = normalizeIdentifier(input);
    const key = identifierKey(identifier);
    if (seen.has(key)) {
      throw new ApplicationError({
        code: "asset.identifier_duplicate",
        kind: "validation",
        message: "asset identifiers must be unique",
        details: identifier,
      });
    }

    seen.add(key);
    normalized.push(identifier);
  }

  return normalized;
}

interface UserProfileLookupService {
  getByID(id: string): Promise<UserProfile | null>;
}

interface AssetServiceDependencies {
  assetRepository: AssetRepository;
  assetCustomFieldReader: AssetCustomFieldProjectionReader;
  userProfileService: UserProfileLookupService;
  domainEventEmitter: DomainEventEmitter;
  logger: Logger;
}

export interface CreateAssetOptions {
  asset: CreateAsset;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateAssetOptions {
  id: string;
  asset: UpdateAsset;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface AddAssetIdentifierOptions {
  assetId: string;
  identifier: CreateAssetIdentifier;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateAssetIdentifierOptions {
  assetId: string;
  identifierId: string;
  identifier: UpdateAssetIdentifier;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface DeleteAssetIdentifierOptions {
  assetId: string;
  identifierId: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface AssetService {
  listAll(options?: AssetListOptions): Promise<Asset[]>;
  listAllWithCustomFields(options?: AssetListOptions): Promise<AssetWithCustomFields[]>;
  getByID(id: string): Promise<Asset | null>;
  getByDisplayName(displayName: string, type?: AssetType): Promise<Asset | null>;
  listByDisplayName(displayName: string, type?: AssetType): Promise<Asset[]>;
  create(opts: CreateAssetOptions): Promise<Asset>;
  updateByID(opts: UpdateAssetOptions): Promise<Asset | null>;
  addIdentifier(opts: AddAssetIdentifierOptions): Promise<AssetIdentifierRecord | null>;
  updateIdentifierByID(opts: UpdateAssetIdentifierOptions): Promise<AssetIdentifierRecord | null>;
  deleteIdentifierByID(opts: DeleteAssetIdentifierOptions): Promise<AssetIdentifierRecord | null>;
  deleteByID(id: string, eventContext?: DomainEventContext): Promise<Asset | null>;
}

export function createAssetService({
  assetRepository,
  assetCustomFieldReader,
  userProfileService,
  domainEventEmitter,
  logger,
}: AssetServiceDependencies): AssetService {
  const emitAssetEvent = createDomainEventEmitter<EventSubjects<AssetEventPayloads>>(
    domainEventEmitter,
    "asset",
  );

  async function getAssetSnapshot(id: string): Promise<AssetWithCustomFields | null> {
    const asset = await assetRepository.getByID(id);
    if (!asset) {
      return null;
    }

    return await hydrateAsset(asset);
  }

  async function hydrateAsset(asset: Asset): Promise<AssetWithCustomFields> {
    const valuesByAssetId = await assetCustomFieldReader.listEffectiveValuesForAssets([asset.id]);
    return {
      ...asset,
      customFields: valuesByAssetId.get(asset.id) ?? [],
    };
  }

  async function hydrateAssets(assets: Asset[]): Promise<AssetWithCustomFields[]> {
    const valuesByAssetId = await assetCustomFieldReader.listEffectiveValuesForAssets(
      assets.map((asset) => asset.id),
    );

    return assets.map((asset) => ({
      ...asset,
      customFields: valuesByAssetId.get(asset.id) ?? [],
    }));
  }

  async function validateOwner(ownerId: string | null | undefined): Promise<void> {
    if (!ownerId) {
      return;
    }

    const owner = await userProfileService.getByID(ownerId);
    if (!owner) {
      throw new ApplicationError({
        code: "asset.owner_unknown",
        kind: "validation",
        message: "asset owner does not exist",
        details: { ownerId },
      });
    }
  }

  function emitUpdatedAssetEvent(
    previous: AssetWithCustomFields,
    current: AssetWithCustomFields,
    eventContext?: DomainEventContext,
  ): void {
    if (assetSnapshotsEqual(previous, current)) {
      return;
    }

    emitAssetEvent("asset.updated", { previous, current }, eventContext);
  }

  async function identifierConflictError(
    identifier: AssetIdentifier,
    context: { assetId?: string; identifierId?: string },
  ): Promise<ApplicationError | null> {
    const conflictingAssetId = await assetRepository.getAssetIDByIdentifier(identifier);
    if (!conflictingAssetId) {
      return null;
    }

    return new ApplicationError({
      code: "asset.identifier_conflict",
      kind: "conflict",
      message: "asset identifier is already owned by another asset",
      details: {
        ...context,
        ...identifier,
        conflictingAssetId,
      },
    });
  }

  return {
    async listAll(options?: AssetListOptions): Promise<Asset[]> {
      try {
        return await assetRepository.list(options);
      } catch (error) {
        logger.error(error, "failed to list assets");
        throw new ApplicationError({
          code: "asset.list_failed",
          kind: "unexpected",
          message: "failed to list assets",
          cause: error,
        });
      }
    },

    async listAllWithCustomFields(options?: AssetListOptions): Promise<AssetWithCustomFields[]> {
      try {
        const assets = await assetRepository.list(options);
        return await hydrateAssets(assets);
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, "failed to list assets with custom fields");
        throw new ApplicationError({
          code: "asset.list_with_custom_fields_failed",
          kind: "unexpected",
          message: "failed to list assets",
          cause: error,
        });
      }
    },

    async getByID(id: string): Promise<Asset | null> {
      try {
        const asset = await assetRepository.getByID(id);
        if (!asset) {
          logger.debug(`asset with id ${id} not found`);
        }
        return asset;
      } catch (error) {
        logger.error(error, `failed to get asset with id ${id}`);
        throw new ApplicationError({
          code: "asset.get_failed",
          kind: "unexpected",
          message: "failed to get asset",
          cause: error,
          details: { assetId: id },
        });
      }
    },

    async getByDisplayName(displayName: string, type?: AssetType): Promise<Asset | null> {
      try {
        const asset = await assetRepository.getByDisplayName(displayName, type);
        if (!asset) {
          logger.debug(`asset with displayName='${displayName}' and type=${type} not found`);
        }
        return asset;
      } catch (error) {
        logger.error(
          error,
          `failed to get asset with displayName='${displayName}' and type=${type}`,
        );
        throw new ApplicationError({
          code: "asset.get_by_name_failed",
          kind: "unexpected",
          message: "failed to get asset",
          cause: error,
          details: { assetDisplayName: displayName, assetType: type },
        });
      }
    },

    async listByDisplayName(displayName: string, type?: AssetType): Promise<Asset[]> {
      try {
        return await assetRepository.listByDisplayName(displayName, type);
      } catch (error) {
        logger.error(
          error,
          `failed to list assets with displayName='${displayName}' and type=${type}`,
        );
        throw new ApplicationError({
          code: "asset.list_by_display_name_failed",
          kind: "unexpected",
          message: "failed to list assets",
          cause: error,
          details: { assetDisplayName: displayName, assetType: type },
        });
      }
    },

    async create(opts: CreateAssetOptions): Promise<Asset> {
      try {
        const displayName = normalizeDisplayName(opts.asset.displayName);
        const identifiers = normalizeIdentifiers(opts.asset.identifiers ?? []);
        await validateOwner(opts.asset.ownerId);

        const now = new Date();
        const created = await assetRepository.create({
          displayName,
          type: opts.asset.type,
          environment: opts.asset.environment ?? AssetEnvironment.Unknown,
          lifecycleState: opts.asset.lifecycleState ?? AssetLifecycleState.Active,
          ownerId: opts.asset.ownerId ?? null,
          identifiers,
          createdAt: now,
          updatedAt: now,
          createdBy: opts.user.id,
          updatedBy: opts.user.id,
        });

        const createdSnapshot = await hydrateAsset(created);
        emitAssetEvent("asset.created", { asset: createdSnapshot }, opts.eventContext);
        return created;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isConflictError(error)) {
          const identifiers = opts.asset.identifiers ?? [];
          for (const input of identifiers) {
            const identifier = normalizeIdentifier(input);
            const conflict = await identifierConflictError(identifier, {});
            if (conflict) {
              throw conflict;
            }
          }
        }

        logger.error(error, `failed to create new asset ${opts.asset.displayName}`);
        throw new ApplicationError({
          code: "asset.create_failed",
          kind: "unexpected",
          message: "failed to create asset",
          cause: error,
          details: { assetDisplayName: opts.asset.displayName, assetType: opts.asset.type },
        });
      }
    },

    async updateByID(opts: UpdateAssetOptions): Promise<Asset | null> {
      try {
        if (Object.keys(opts.asset).length === 0) {
          throw new ApplicationError({
            code: "asset.update_empty",
            kind: "validation",
            message: "at least one asset field must be provided",
          });
        }

        const asset: UpdateAsset = {
          ...opts.asset,
          ...(opts.asset.displayName === undefined
            ? {}
            : { displayName: normalizeDisplayName(opts.asset.displayName) }),
        };

        const previousAsset = await assetRepository.getByID(opts.id);
        if (!previousAsset) {
          logger.debug(`cannot update asset ${opts.id}: not found`);
          return null;
        }

        await validateOwner(asset.ownerId);

        const hasChanges = Object.entries(asset).some(
          ([key, value]) => previousAsset[key as keyof UpdateAsset] !== value,
        );
        if (!hasChanges) {
          return previousAsset;
        }

        const updated = await assetRepository.updateByID(opts.id, {
          ...asset,
          updatedAt: new Date(),
          updatedBy: opts.user.id,
        });
        if (!updated) {
          logger.debug(`cannot update asset ${opts.id}: not found`);
          return null;
        }

        const previous = await hydrateAsset(previousAsset);
        const current = await getAssetSnapshot(opts.id);
        if (current) {
          emitUpdatedAssetEvent(previous, current, opts.eventContext);
        }
        return updated;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, `failed to update asset with id ${opts.id}`);
        throw new ApplicationError({
          code: "asset.update_failed",
          kind: "unexpected",
          message: "failed to update asset",
          cause: error,
          details: { assetId: opts.id },
        });
      }
    },

    async addIdentifier(opts: AddAssetIdentifierOptions): Promise<AssetIdentifierRecord | null> {
      try {
        const previous = await getAssetSnapshot(opts.assetId);
        if (!previous) {
          logger.debug(`cannot add identifier to asset ${opts.assetId}: not found`);
          return null;
        }

        const identifier = normalizeIdentifier(opts.identifier);
        const created = await assetRepository.addIdentifier(opts.assetId, identifier, {
          updatedAt: new Date(),
          updatedBy: opts.user.id,
        });
        if (!created) {
          logger.debug(`cannot add identifier to asset ${opts.assetId}: not found`);
          return null;
        }

        const current = await getAssetSnapshot(opts.assetId);
        if (current) {
          emitUpdatedAssetEvent(previous, current, opts.eventContext);
        }
        return created;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isConflictError(error)) {
          const identifier = normalizeIdentifier(opts.identifier);
          const conflict = await identifierConflictError(identifier, { assetId: opts.assetId });
          if (conflict) {
            throw conflict;
          }
        }

        logger.error(error, `failed to add identifier to asset ${opts.assetId}`);
        throw new ApplicationError({
          code: "asset.identifier_add_failed",
          kind: "unexpected",
          message: "failed to add asset identifier",
          cause: error,
          details: { assetId: opts.assetId },
        });
      }
    },

    async updateIdentifierByID(
      opts: UpdateAssetIdentifierOptions,
    ): Promise<AssetIdentifierRecord | null> {
      try {
        const previous = await getAssetSnapshot(opts.assetId);
        if (!previous) {
          logger.debug(`cannot update identifier ${opts.identifierId}: asset not found`);
          return null;
        }

        const currentIdentifier = previous.identifiers.find(
          (identifier) => identifier.id === opts.identifierId,
        );
        if (!currentIdentifier) {
          logger.debug(`cannot update identifier ${opts.identifierId}: not found`);
          return null;
        }

        const identifier = normalizeIdentifier(opts.identifier);
        if (identifierKey(currentIdentifier) === identifierKey(identifier)) {
          return currentIdentifier;
        }

        const updated = await assetRepository.updateIdentifierByID(
          opts.assetId,
          opts.identifierId,
          identifier,
          {
            updatedAt: new Date(),
            updatedBy: opts.user.id,
          },
        );
        if (!updated) {
          logger.debug(`cannot update identifier ${opts.identifierId}: not found`);
          return null;
        }

        const current = await getAssetSnapshot(opts.assetId);
        if (current) {
          emitUpdatedAssetEvent(previous, current, opts.eventContext);
        }
        return updated;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isConflictError(error)) {
          const identifier = normalizeIdentifier(opts.identifier);
          const conflict = await identifierConflictError(identifier, {
            assetId: opts.assetId,
            identifierId: opts.identifierId,
          });
          if (conflict) {
            throw conflict;
          }
        }

        logger.error(error, `failed to update identifier ${opts.identifierId}`);
        throw new ApplicationError({
          code: "asset.identifier_update_failed",
          kind: "unexpected",
          message: "failed to update asset identifier",
          cause: error,
          details: { assetId: opts.assetId, identifierId: opts.identifierId },
        });
      }
    },

    async deleteIdentifierByID(
      opts: DeleteAssetIdentifierOptions,
    ): Promise<AssetIdentifierRecord | null> {
      try {
        const previous = await getAssetSnapshot(opts.assetId);
        if (!previous) {
          logger.debug(`cannot delete identifier ${opts.identifierId}: asset not found`);
          return null;
        }

        const deleted = await assetRepository.deleteIdentifierByID(
          opts.assetId,
          opts.identifierId,
          {
            updatedAt: new Date(),
            updatedBy: opts.user.id,
          },
        );
        if (!deleted) {
          logger.debug(`cannot delete identifier ${opts.identifierId}: not found`);
          return null;
        }

        const current = await getAssetSnapshot(opts.assetId);
        if (current) {
          emitUpdatedAssetEvent(previous, current, opts.eventContext);
        }
        return deleted;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, `failed to delete identifier ${opts.identifierId}`);
        throw new ApplicationError({
          code: "asset.identifier_delete_failed",
          kind: "unexpected",
          message: "failed to delete asset identifier",
          cause: error,
          details: { assetId: opts.assetId, identifierId: opts.identifierId },
        });
      }
    },

    async deleteByID(id: string, eventContext?: DomainEventContext): Promise<Asset | null> {
      try {
        const deletedSnapshot = await getAssetSnapshot(id);
        if (!deletedSnapshot) {
          logger.debug(`cannot delete asset ${id}: not found`);
          return null;
        }

        const linkedFindingCount = await assetRepository.countFindingsByAssetID(id);
        if (linkedFindingCount > 0) {
          throw new ApplicationError({
            code: "asset.delete_referenced_by_findings",
            kind: "conflict",
            message: `asset ${id} is still referenced by findings`,
            details: { assetId: id },
          });
        }

        const asset = await assetRepository.deleteByID(id);
        if (!asset) {
          logger.debug(`cannot delete asset ${id}: not found`);
          return null;
        }
        emitAssetEvent("asset.deleted", { asset: deletedSnapshot }, eventContext);
        return asset;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isForeignKeyError(error)) {
          logger.debug(error, "asset delete foreign key conflict");
          throw new ApplicationError({
            code: "asset.delete_referenced_by_findings",
            kind: "conflict",
            message: `asset ${id} is still referenced by findings`,
            cause: error,
            details: { assetId: id },
          });
        }

        logger.error(error, `failed to delete asset with id ${id}`);
        throw new ApplicationError({
          code: "asset.delete_failed",
          kind: "unexpected",
          message: "failed to delete asset",
          cause: error,
          details: { assetId: id },
        });
      }
    },
  };
}
