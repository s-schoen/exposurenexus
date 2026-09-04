import { sql } from "kysely";

import { type Database } from "../database/index.js";

import type { Asset, AssetIdentifierRecord } from "@exposurenexus/contracts/model/asset";
import type { Kysely, Selectable, Transaction } from "kysely";

export type DatabaseExecutor = Kysely<Database> | Transaction<Database>;
export type AssetRow = Selectable<Database["asset"]>;
type AssetIdentifierRow = Selectable<Database["asset_identifier"]>;

export function toAssetIdentifier(row: AssetIdentifierRow): AssetIdentifierRecord {
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

export async function toAssets(
  database: DatabaseExecutor,
  rows: readonly AssetRow[],
): Promise<Asset[]> {
  const identifiersByAssetId = await listIdentifiersByAssetIDs(
    database,
    rows.map((asset) => asset.id),
  );

  return rows.map((asset) => ({
    ...asset,
    identifiers: identifiersByAssetId.get(asset.id) ?? [],
  }));
}

export async function getAssetByID(database: DatabaseExecutor, id: string): Promise<Asset | null> {
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
