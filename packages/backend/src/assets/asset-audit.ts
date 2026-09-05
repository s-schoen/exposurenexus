import type { DatabaseExecutor } from "../database/executor.js";
import type { Asset } from "@exposurenexus/contracts/model/asset";

export type AssetAuditRecord = Pick<Asset, "updatedAt" | "updatedBy">;

export async function updateAssetAudit(
  database: DatabaseExecutor,
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
