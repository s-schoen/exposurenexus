import {
  type Asset,
  type AssetWithCustomFields,
  type AssetIdentifier,
  type AssetIdentifierRecord,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { sql, type Kysely } from "kysely";

import { type Database } from "../database/index.js";
import { updateAssetAudit, type AssetAuditRecord } from "./asset-audit.js";
import { getAssetSnapshot } from "./asset-custom-field-repository.js";
import {
  getAssetByID,
  toAssetIdentifier,
  toAssets,
  type DatabaseExecutor,
} from "./asset-records.js";

import type { AssetListOptions } from "./assets.js";

export type CreateAssetRecord = Omit<Asset, "id" | "identifiers"> & {
  identifiers?: readonly AssetIdentifier[];
};
export type UpdateAssetRecord = Partial<
  Pick<Asset, "displayName" | "type" | "environment" | "lifecycleState" | "ownerId">
> &
  Pick<Asset, "updatedAt" | "updatedBy">;
export interface AssetUpdatePersistenceResult {
  previous: AssetWithCustomFields;
  current: AssetWithCustomFields;
}

export interface AssetIdentifierMutationPersistenceResult extends AssetUpdatePersistenceResult {
  identifier: AssetIdentifierRecord;
}

export interface AssetDeletePersistenceResult {
  previous: AssetWithCustomFields;
}

type AssetIdentifierIdentity = Pick<AssetIdentifier, "type" | "namespace" | "value">;

export interface AssetRepository {
  list(options?: AssetListOptions): Promise<Asset[]>;
  getByID(id: string): Promise<Asset | null>;
  getByDisplayName(displayName: string, type?: AssetType): Promise<Asset | null>;
  listByDisplayName(displayName: string, type?: AssetType): Promise<Asset[]>;
  getIdentifierByID(assetId: string, identifierId: string): Promise<AssetIdentifierRecord | null>;
  getAssetIDByIdentifier(identifier: AssetIdentifierIdentity): Promise<string | null>;
  create(asset: CreateAssetRecord): Promise<Asset>;
  updateByID(id: string, asset: UpdateAssetRecord): Promise<AssetUpdatePersistenceResult | null>;
  addIdentifier(
    assetId: string,
    identifier: AssetIdentifierIdentity,
    audit: AssetAuditRecord,
  ): Promise<AssetIdentifierMutationPersistenceResult | null>;
  updateIdentifierByID(
    assetId: string,
    identifierId: string,
    identifier: AssetIdentifierIdentity,
    audit: AssetAuditRecord,
  ): Promise<AssetIdentifierMutationPersistenceResult | null>;
  deleteIdentifierByID(
    assetId: string,
    identifierId: string,
    audit: AssetAuditRecord,
  ): Promise<AssetIdentifierMutationPersistenceResult | null>;
  deleteByID(id: string): Promise<AssetDeletePersistenceResult | null>;
  countFindingsByAssetID(id: string): Promise<number>;
}

function identityQuery(database: DatabaseExecutor, identifier: AssetIdentifierIdentity) {
  let query = database
    .selectFrom("asset_identifier")
    .select("assetId")
    .where("type", "=", identifier.type)
    .where("value", "=", identifier.value);

  query =
    identifier.namespace === null
      ? query.where("namespace", "is", null)
      : query.where("namespace", "=", identifier.namespace);

  return query;
}

export function createAssetRepository(database: Kysely<Database>): AssetRepository {
  return {
    async list(options: AssetListOptions = {}): Promise<Asset[]> {
      let query = database.selectFrom("asset").selectAll();

      const search = options.search?.trim().toLowerCase();
      if (search) {
        query = query.where(sql<boolean>`(
          position(${search} in lower("asset"."displayName")) > 0
          or exists (
            select 1
            from "asset_identifier"
            where "asset_identifier"."assetId" = "asset"."id"
              and position(${search} in lower("asset_identifier"."value")) > 0
          )
        )`);
      }

      if (options.types && options.types.length > 0) {
        query = query.where("type", "in", [...options.types]);
      }

      if (options.environments && options.environments.length > 0) {
        query = query.where("environment", "in", [...options.environments]);
      }

      if (options.lifecycleStates && options.lifecycleStates.length > 0) {
        query = query.where("lifecycleState", "in", [...options.lifecycleStates]);
      }

      if (options.ownerIds && options.ownerIds.length > 0) {
        const includesOwnerless = options.ownerIds.includes(null);
        const ownerIds = options.ownerIds.filter((ownerId): ownerId is string => ownerId !== null);

        if (includesOwnerless && ownerIds.length > 0) {
          query = query.where((expressionBuilder) =>
            expressionBuilder.or([
              expressionBuilder("ownerId", "is", null),
              expressionBuilder("ownerId", "in", ownerIds),
            ]),
          );
        } else if (includesOwnerless) {
          query = query.where("ownerId", "is", null);
        } else if (ownerIds.length > 0) {
          query = query.where("ownerId", "in", ownerIds);
        }
      }

      const data = await query.execute();
      return await toAssets(database, data);
    },

    async getByID(id: string): Promise<Asset | null> {
      return await getAssetByID(database, id);
    },

    async getByDisplayName(displayName: string, type?: AssetType): Promise<Asset | null> {
      let query = database.selectFrom("asset").selectAll().where("displayName", "=", displayName);
      if (type) {
        query = query.where("type", "=", type);
      }

      const asset = await query.executeTakeFirst();
      return asset ? ((await toAssets(database, [asset]))[0] ?? null) : null;
    },

    async listByDisplayName(displayName: string, type?: AssetType): Promise<Asset[]> {
      let query = database.selectFrom("asset").selectAll().where("displayName", "=", displayName);
      if (type) {
        query = query.where("type", "=", type);
      }

      return await toAssets(database, await query.execute());
    },

    async getIdentifierByID(
      assetId: string,
      identifierId: string,
    ): Promise<AssetIdentifierRecord | null> {
      const identifier = await database
        .selectFrom("asset_identifier")
        .selectAll()
        .where("assetId", "=", assetId)
        .where("id", "=", identifierId)
        .executeTakeFirst();

      return identifier ? toAssetIdentifier(identifier) : null;
    },

    async getAssetIDByIdentifier(identifier: AssetIdentifierIdentity): Promise<string | null> {
      const match = await identityQuery(database, identifier).executeTakeFirst();
      return match?.assetId ?? null;
    },

    async create(asset: CreateAssetRecord): Promise<Asset> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const { identifiers = [], ...assetRecord } = asset;
          const createdAsset = await trx
            .insertInto("asset")
            .values(assetRecord)
            .returningAll()
            .executeTakeFirstOrThrow();

          if (identifiers.length > 0) {
            await trx
              .insertInto("asset_identifier")
              .values(
                identifiers.map((identifier) => ({
                  assetId: createdAsset.id,
                  type: identifier.type,
                  namespace: identifier.namespace,
                  value: identifier.value,
                })),
              )
              .execute();
          }

          return (await getAssetByID(trx, createdAsset.id))!;
        });
    },

    async updateByID(
      id: string,
      asset: UpdateAssetRecord,
    ): Promise<AssetUpdatePersistenceResult | null> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const previous = await getAssetSnapshot(trx, id);
          if (!previous) {
            return null;
          }

          const updatedAsset = await trx
            .updateTable("asset")
            .set({
              ...(asset.displayName === undefined ? {} : { displayName: asset.displayName }),
              ...(asset.type === undefined ? {} : { type: asset.type }),
              ...(asset.environment === undefined ? {} : { environment: asset.environment }),
              ...(asset.lifecycleState === undefined
                ? {}
                : { lifecycleState: asset.lifecycleState }),
              ...(asset.ownerId === undefined ? {} : { ownerId: asset.ownerId }),
              updatedAt: asset.updatedAt,
              updatedBy: asset.updatedBy,
            })
            .where("id", "=", id)
            .returning("id")
            .executeTakeFirst();

          if (!updatedAsset) {
            return null;
          }

          const current = await getAssetSnapshot(trx, updatedAsset.id);
          if (!current) {
            throw new Error(`updated asset ${updatedAsset.id} could not be loaded`);
          }

          return { previous, current };
        });
    },

    async addIdentifier(
      assetId: string,
      identifier: AssetIdentifierIdentity,
      audit: AssetAuditRecord,
    ): Promise<AssetIdentifierMutationPersistenceResult | null> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const previous = await getAssetSnapshot(trx, assetId);
          if (!previous) {
            return null;
          }

          const created = await trx
            .insertInto("asset_identifier")
            .values({ assetId, ...identifier })
            .returningAll()
            .executeTakeFirstOrThrow();
          await updateAssetAudit(trx, assetId, audit);

          const current = await getAssetSnapshot(trx, assetId);
          if (!current) {
            throw new Error(`updated asset ${assetId} could not be loaded`);
          }

          return { identifier: toAssetIdentifier(created), previous, current };
        });
    },

    async updateIdentifierByID(
      assetId: string,
      identifierId: string,
      identifier: AssetIdentifierIdentity,
      audit: AssetAuditRecord,
    ): Promise<AssetIdentifierMutationPersistenceResult | null> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const previous = await getAssetSnapshot(trx, assetId);
          if (!previous) {
            return null;
          }

          const updated = await trx
            .updateTable("asset_identifier")
            .set(identifier)
            .where("assetId", "=", assetId)
            .where("id", "=", identifierId)
            .returningAll()
            .executeTakeFirst();
          if (!updated) {
            return null;
          }

          await updateAssetAudit(trx, assetId, audit);
          const current = await getAssetSnapshot(trx, assetId);
          if (!current) {
            throw new Error(`updated asset ${assetId} could not be loaded`);
          }

          return { identifier: toAssetIdentifier(updated), previous, current };
        });
    },

    async deleteIdentifierByID(
      assetId: string,
      identifierId: string,
      audit: AssetAuditRecord,
    ): Promise<AssetIdentifierMutationPersistenceResult | null> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const previous = await getAssetSnapshot(trx, assetId);
          if (!previous) {
            return null;
          }

          const deleted = await trx
            .deleteFrom("asset_identifier")
            .where("assetId", "=", assetId)
            .where("id", "=", identifierId)
            .returningAll()
            .executeTakeFirst();
          if (!deleted) {
            return null;
          }

          await updateAssetAudit(trx, assetId, audit);
          const current = await getAssetSnapshot(trx, assetId);
          if (!current) {
            throw new Error(`updated asset ${assetId} could not be loaded`);
          }

          return { identifier: toAssetIdentifier(deleted), previous, current };
        });
    },

    async deleteByID(id: string): Promise<AssetDeletePersistenceResult | null> {
      return await database
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (trx) => {
          const previous = await getAssetSnapshot(trx, id);
          if (!previous) {
            return null;
          }

          await trx.deleteFrom("asset").where("id", "=", id).execute();
          return { previous };
        });
    },

    async countFindingsByAssetID(id: string): Promise<number> {
      const result = await database
        .selectFrom("finding")
        .select(database.fn.countAll().as("count"))
        .where("assetId", "=", id)
        .executeTakeFirst();

      return Number(result?.count ?? 0);
    },
  };
}
