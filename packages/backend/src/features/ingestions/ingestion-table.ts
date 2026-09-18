import type { Generated } from "kysely";

export interface IngestionTable {
  id: Generated<string>;
  source: string;
  createdAt: Date;
  createdBy: string;
}
