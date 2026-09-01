import { type Database } from "@exposurenexus/backend/database";
import {
  type Asset,
  type AssetIdentifier,
  type AssetIdentifierRecord,
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { sql, type Kysely, type Selectable, type Transaction } from "kysely";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
type AssetRow = Selectable<Database["asset"]>;
type AssetIdentifierRow = Selectable<Database["asset_identifier"]>;

export type CreateAssetRecord = Omit<Asset, "id" | "identifiers"> & {
  identifiers?: readonly AssetIdentifier[];
};
export type UpdateAssetRecord = Partial<
  Pick<Asset, "displayName" | "type" | "environment" | "lifecycleState" | "ownerId">
> &
  Pick<Asset, "updatedAt" | "updatedBy">;
export type AssetAuditRecord = Pick<Asset, "updatedAt" | "updatedBy">;

export interface AssetListOptions {
  search?: string;
  types?: readonly AssetType[];
  environments?: readonly AssetEnvironment[];
  lifecycleStates?: readonly AssetLifecycleState[];
  ownerIds?: readonly (string | null)[];
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
  updateByID(id: string, asset: UpdateAssetRecord): Promise<Asset | null>;
  addIdentifier(
    assetId: string,
    identifier: AssetIdentifierIdentity,
    audit: AssetAuditRecord,
  ): Promise<AssetIdentifierRecord | null>;
  updateIdentifierByID(
    assetId: string,
    identifierId: string,
    identifier: AssetIdentifierIdentity,
    audit: AssetAuditRecord,
  ): Promise<AssetIdentifierRecord | null>;
  deleteIdentifierByID(
    assetId: string,
    identifierId: string,
    audit: AssetAuditRecord,
  ): Promise<AssetIdentifierRecord | null>;
  deleteByID(id: string): Promise<Asset | null>;
  countFindingsByAssetID(id: string): Promise<number>;
}

function toAssetIdentifier(row: AssetIdentifierRow): AssetIdentifierRecord {
  return {
    id: row.id,
    type: row.type,
    namespace: row.namespace,
    value: row.value,
  };
}

async function listIdentifiersByAssetIDs(
  database: DatabaseExecutor,
  assetIds: readonly string[],
): Promise<Map<string, AssetIdentifierRecord[]>> {
  const identifiersByAssetId = new Map<string, AssetIdentifierRecord[]>();
  if (assetIds.length === 0) {
    return identifiersByAssetId;
  }

  const rows = await database
    .selectFrom("asset_identifier")
    .selectAll()
    .where("assetId", "in", [...assetIds])
    .orderBy("type", "asc")
    .orderBy(sql`coalesce("namespace", '')`, "asc")
    .orderBy("value", "asc")
    .execute();

  for (const row of rows) {
    const identifiers = identifiersByAssetId.get(row.assetId) ?? [];
    identifiers.push(toAssetIdentifier(row));
    identifiersByAssetId.set(row.assetId, identifiers);
  }

  return identifiersByAssetId;
}

async function toAssets(database: DatabaseExecutor, rows: readonly AssetRow[]): Promise<Asset[]> {
  const identifiersByAssetId = await listIdentifiersByAssetIDs(
    database,
    rows.map((asset) => asset.id),
  );

  return rows.map((asset) => ({
    ...asset,
    identifiers: identifiersByAssetId.get(asset.id) ?? [],
  }));
}

async function getAssetByID(database: DatabaseExecutor, id: string): Promise<Asset | null> {
  const asset = await database
    .selectFrom("asset")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!asset) {
    return null;
  }

  return (await toAssets(database, [asset]))[0] ?? null;
}

export async function updateAssetAudit(
  database: Kysely<Database> | Transaction<Database>,
  assetId: string,
  audit: AssetAuditRecord,
): Promise<void> {
  await database
    .updateTable("asset")
    .set({
      updatedAt: audit.updatedAt,
      updatedBy: audit.updatedBy,
    })
    .where("id", "=", assetId)
    .execute();
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
      return await database.transaction().execute(async (trx) => {
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

    async updateByID(id: string, asset: UpdateAssetRecord): Promise<Asset | null> {
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
        .returningAll()
        .executeTakeFirst();

      return updatedAsset ? await getAssetByID(database, updatedAsset.id) : null;
    },

    async addIdentifier(
      assetId: string,
      identifier: AssetIdentifierIdentity,
      audit: AssetAuditRecord,
    ): Promise<AssetIdentifierRecord | null> {
      return await database.transaction().execute(async (trx) => {
        const asset = await trx
          .selectFrom("asset")
          .select("id")
          .where("id", "=", assetId)
          .executeTakeFirst();
        if (!asset) {
          return null;
        }

        const created = await trx
          .insertInto("asset_identifier")
          .values({ assetId, ...identifier })
          .returningAll()
          .executeTakeFirstOrThrow();
        await updateAssetAudit(trx, assetId, audit);
        return toAssetIdentifier(created);
      });
    },

    async updateIdentifierByID(
      assetId: string,
      identifierId: string,
      identifier: AssetIdentifierIdentity,
      audit: AssetAuditRecord,
    ): Promise<AssetIdentifierRecord | null> {
      return await database.transaction().execute(async (trx) => {
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
        return toAssetIdentifier(updated);
      });
    },

    async deleteIdentifierByID(
      assetId: string,
      identifierId: string,
      audit: AssetAuditRecord,
    ): Promise<AssetIdentifierRecord | null> {
      return await database.transaction().execute(async (trx) => {
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
        return toAssetIdentifier(deleted);
      });
    },

    async deleteByID(id: string): Promise<Asset | null> {
      return await database.transaction().execute(async (trx) => {
        const existingAsset = await getAssetByID(trx, id);
        if (!existingAsset) {
          return null;
        }

        await trx.deleteFrom("asset").where("id", "=", id).execute();
        return existingAsset;
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
