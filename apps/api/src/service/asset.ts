import {
  type Asset,
  type AssetWithCustomFields,
  AssetType,
  type CreateAsset,
} from "@exposurenexus/types/model/asset";
import { type AssetCustomFieldValue } from "@exposurenexus/types/model/asset-custom-field";

import {
  createDomainEventEmitter,
  type AssetEventPayloads,
  type DomainEventContext,
  type DomainEventEmitter,
} from "../lib/eventbus/events/index.js";
import { ApplicationError, isApplicationError } from "./application-error.js";
import { isForeignKeyError } from "./errors.js";

import type { AssetRepository } from "../repository/asset.js";
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

export interface UpdateAssetOwnerOptions {
  id: string;
  ownerId: Asset["ownerId"];
  eventContext?: DomainEventContext;
}

export interface AssetService {
  listAll(): Promise<Asset[]>;
  listAllWithCustomFields(): Promise<AssetWithCustomFields[]>;
  getByID(id: string): Promise<Asset | null>;
  getByName(name: string, type?: AssetType): Promise<Asset | null>;
  create(asset: CreateAsset, eventContext?: DomainEventContext): Promise<Asset>;
  updateOwnerByID(opts: UpdateAssetOwnerOptions): Promise<Asset | null>;
  deleteByID(id: string, eventContext?: DomainEventContext): Promise<Asset | null>;
}

export function createAssetService({
  assetRepository,
  assetCustomFieldReader,
  userProfileService,
  domainEventEmitter,
  logger,
}: AssetServiceDependencies): AssetService {
  type AssetEventSubject = keyof AssetEventPayloads & string;
  const emitAssetEvent = createDomainEventEmitter<AssetEventSubject>(domainEventEmitter, "asset");

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

  return {
    async listAll(): Promise<Asset[]> {
      try {
        return await assetRepository.list();
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

    async listAllWithCustomFields(): Promise<AssetWithCustomFields[]> {
      try {
        const assets = await assetRepository.list();
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

    async getByName(name: string, type?: AssetType): Promise<Asset | null> {
      try {
        const asset = await assetRepository.getByName(name, type);
        if (!asset) {
          logger.debug(`asset with name='${name}' and type=${type} not found`);
        }
        return asset;
      } catch (error) {
        logger.error(error, `failed to get asset with name='${name}' and type=${type}`);
        throw new ApplicationError({
          code: "asset.get_by_name_failed",
          kind: "unexpected",
          message: "failed to get asset",
          cause: error,
          details: { assetName: name, assetType: type },
        });
      }
    },

    async create(asset: CreateAsset, eventContext?: DomainEventContext): Promise<Asset> {
      try {
        if (asset.ownerId) {
          const owner = await userProfileService.getByID(asset.ownerId);

          if (!owner) {
            throw new ApplicationError({
              code: "asset.owner_unknown",
              kind: "validation",
              message: "asset owner does not exist",
              details: { ownerId: asset.ownerId },
            });
          }
        }

        const created = await assetRepository.create({
          id: "",
          ownerId: null,
          ...asset,
        });

        const createdSnapshot = await hydrateAsset(created);
        emitAssetEvent("asset.created", { asset: createdSnapshot }, eventContext);
        return created;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, `failed to create new asset ${asset.name}`);
        throw new ApplicationError({
          code: "asset.create_failed",
          kind: "unexpected",
          message: "failed to create asset",
          cause: error,
          details: { assetName: asset.name, assetType: asset.type },
        });
      }
    },

    async updateOwnerByID(opts: UpdateAssetOwnerOptions): Promise<Asset | null> {
      const { id, ownerId, eventContext } = opts;

      try {
        if (ownerId) {
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

        const previous = await getAssetSnapshot(id);
        if (!previous) {
          logger.debug(`cannot update asset ${id} owner: not found`);
          return null;
        }

        const updated = await assetRepository.updateOwnerByID(id, ownerId);
        if (!updated) {
          logger.debug(`cannot update asset ${id} owner: not found`);
          return null;
        }

        const current = await getAssetSnapshot(id);
        if (current) {
          emitUpdatedAssetEvent(previous, current, eventContext);
        }
        return updated;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, `failed to update asset ${id} owner`);
        throw new ApplicationError({
          code: "asset.owner_update_failed",
          kind: "unexpected",
          message: "failed to update asset owner",
          cause: error,
          details: { assetId: id },
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
