import type { Generated } from "kysely";

export interface IngestionTable {
  id: Generated<string>;
  source: "nuclei";
  createdAt: Date;
  createdBy: string;
}
