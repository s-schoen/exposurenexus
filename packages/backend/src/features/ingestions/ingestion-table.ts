import type { Generated } from "kysely";

export type IngestionStatus = "pending" | "completed" | "failed";

export interface IngestionTable {
  id: Generated<string>;
  source: string;
  createdAt: Date;
  createdBy: string;
  status: Generated<IngestionStatus>;
  processedAt: Date | null;
  failureCode: string | null;
}
