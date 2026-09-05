import {
  type Asset,
  type AssetIdentifier,
  type AssetIdentifierRecord,
  type AssetWithCustomFields,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { sql } from "kysely";

import { updateAssetAudit, type AssetAuditRecord } from "./asset-audit.js";
import { getAssetSnapshot } from "./asset-projection.js";
import { getAssetByID, toAssetIdentifier, toAssets } from "./asset-records.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { AssetListOptions } from "./assets.js";

export { getAssetByID } from "./asset-records.js";

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

export async function listAssets(
  database: DatabaseExecutor,
  options: AssetListOptions = {},
): Promise<Asset[]> {
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

  return await toAssets(database, await query.execute());
}

export async function getAssetByDisplayName(
  database: DatabaseExecutor,
  displayName: string,
  type?: AssetType,
): Promise<Asset | null> {
  let query = database.selectFrom("asset").selectAll().where("displayName", "=", displayName);
  if (type) {
    query = query.where("type", "=", type);
  }

  const asset = await query.executeTakeFirst();
  return asset ? ((await toAssets(database, [asset]))[0] ?? null) : null;
}

export async function listAssetsByDisplayName(
  database: DatabaseExecutor,
  displayName: string,
  type?: AssetType,
): Promise<Asset[]> {
  let query = database.selectFrom("asset").selectAll().where("displayName", "=", displayName);
  if (type) {
    query = query.where("type", "=", type);
  }

  return await toAssets(database, await query.execute());
}

export async function getAssetIDByIdentifier(
  database: DatabaseExecutor,
  identifier: AssetIdentifierIdentity,
): Promise<string | null> {
  const match = await identityQuery(database, identifier).executeTakeFirst();
  return match?.assetId ?? null;
}

export async function insertAsset(
  database: DatabaseExecutor,
  asset: CreateAssetRecord,
): Promise<Asset> {
  const { identifiers = [], ...assetRecord } = asset;
  const createdAsset = await database
    .insertInto("asset")
    .values(assetRecord)
    .returningAll()
    .executeTakeFirstOrThrow();

  if (identifiers.length > 0) {
    await database
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

  return (await getAssetByID(database, createdAsset.id))!;
}

export async function updateAsset(
  database: DatabaseExecutor,
  {
    id,
    asset,
    previous,
  }: {
    id: string;
    asset: UpdateAssetRecord;
    previous: AssetWithCustomFields;
  },
): Promise<AssetUpdatePersistenceResult | null> {
  const updatedAsset = await database
    .updateTable("asset")
    .set({
      ...(asset.displayName === undefined ? {} : { displayName: asset.displayName }),
      ...(asset.type === undefined ? {} : { type: asset.type }),
      ...(asset.environment === undefined ? {} : { environment: asset.environment }),
      ...(asset.lifecycleState === undefined ? {} : { lifecycleState: asset.lifecycleState }),
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

  const current = await getAssetSnapshot(database, updatedAsset.id);
  if (!current) {
    throw new Error(`updated asset ${updatedAsset.id} could not be loaded`);
  }

  return { previous, current };
}

export async function addAssetIdentifier(
  database: DatabaseExecutor,
  {
    assetId,
    identifier,
    audit,
    previous,
  }: {
    assetId: string;
    identifier: AssetIdentifierIdentity;
    audit: AssetAuditRecord;
    previous: AssetWithCustomFields;
  },
): Promise<AssetIdentifierMutationPersistenceResult> {
  const created = await database
    .insertInto("asset_identifier")
    .values({ assetId, ...identifier })
    .returningAll()
    .executeTakeFirstOrThrow();
  await updateAssetAudit(database, assetId, audit);

  const current = await getAssetSnapshot(database, assetId);
  if (!current) {
    throw new Error(`updated asset ${assetId} could not be loaded`);
  }

  return { identifier: toAssetIdentifier(created), previous, current };
}

export async function updateAssetIdentifier(
  database: DatabaseExecutor,
  {
    assetId,
    identifierId,
    identifier,
    audit,
    previous,
  }: {
    assetId: string;
    identifierId: string;
    identifier: AssetIdentifierIdentity;
    audit: AssetAuditRecord;
    previous: AssetWithCustomFields;
  },
): Promise<AssetIdentifierMutationPersistenceResult | null> {
  const updated = await database
    .updateTable("asset_identifier")
    .set(identifier)
    .where("assetId", "=", assetId)
    .where("id", "=", identifierId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    return null;
  }

  await updateAssetAudit(database, assetId, audit);
  const current = await getAssetSnapshot(database, assetId);
  if (!current) {
    throw new Error(`updated asset ${assetId} could not be loaded`);
  }

  return { identifier: toAssetIdentifier(updated), previous, current };
}

export async function deleteAssetIdentifier(
  database: DatabaseExecutor,
  {
    assetId,
    identifierId,
    audit,
    previous,
  }: {
    assetId: string;
    identifierId: string;
    audit: AssetAuditRecord;
    previous: AssetWithCustomFields;
  },
): Promise<AssetIdentifierMutationPersistenceResult | null> {
  const deleted = await database
    .deleteFrom("asset_identifier")
    .where("assetId", "=", assetId)
    .where("id", "=", identifierId)
    .returningAll()
    .executeTakeFirst();
  if (!deleted) {
    return null;
  }

  await updateAssetAudit(database, assetId, audit);
  const current = await getAssetSnapshot(database, assetId);
  if (!current) {
    throw new Error(`updated asset ${assetId} could not be loaded`);
  }

  return { identifier: toAssetIdentifier(deleted), previous, current };
}

export async function deleteAsset(
  database: DatabaseExecutor,
  { id, previous }: { id: string; previous: AssetWithCustomFields },
): Promise<AssetDeletePersistenceResult | null> {
  const deleted = await database.deleteFrom("asset").where("id", "=", id).returning("id").execute();
  return deleted.length > 0 ? { previous } : null;
}

export async function countFindingsByAssetID(
  database: DatabaseExecutor,
  id: string,
): Promise<number> {
  const result = await database
    .selectFrom("finding")
    .select(database.fn.countAll().as("count"))
    .where("assetId", "=", id)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}
