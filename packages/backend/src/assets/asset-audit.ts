import { type Database } from "../database/index.js";

import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Kysely, Transaction } from "kysely";

export type AssetAuditRecord = Pick<Asset, "updatedAt" | "updatedBy">;

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
