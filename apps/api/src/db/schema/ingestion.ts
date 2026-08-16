import type { IngestionSource } from "@exposurenexus/types/model/ingestion";
import type { Generated } from "kysely";

export interface IngestionTable {
  id: Generated<string>;
  source: IngestionSource;
  scope: Record<string, unknown>;
  createdAt: Date;
  createdBy: string;
  processed: number;
  createdObservations: number;
  skipped: number;
  errors: number;
}
