import { ingestionSchema, type Ingestion } from "@exposurenexus/types/model/ingestion";

import type { Database } from "../db/index.js";
import type { IngestionTable } from "../db/schema/ingestion.js";
import type { Kysely, Insertable } from "kysely";

type IngestionRecord = Ingestion;
export type CreateIngestionRecord = Omit<
  Insertable<IngestionTable>,
  "processed" | "createdObservations" | "skipped" | "errors"
> &
  Partial<Pick<IngestionTable, "processed" | "createdObservations" | "skipped" | "errors">>;

export interface IngestionRepository {
  getByID(id: string): Promise<IngestionRecord | null>;
  create(ingestion: CreateIngestionRecord): Promise<IngestionRecord>;
  updateSummaryByID(
    id: string,
    summary: Pick<IngestionTable, "processed" | "createdObservations" | "skipped" | "errors">,
  ): Promise<IngestionRecord | null>;
}

function normalizeIngestion(ingestion: IngestionRecord): IngestionRecord {
  return ingestionSchema.parse(ingestion);
}

const ingestionScopeSchema = ingestionSchema.shape.scope;
const ingestionCounterSchema = ingestionSchema.shape.processed;

function normalizeIngestionInput<
  T extends {
    scope: unknown;
    processed?: unknown;
    createdObservations?: unknown;
    skipped?: unknown;
    errors?: unknown;
  },
>(ingestion: T): T {
  return {
    ...ingestion,
    scope: ingestionScopeSchema.parse(ingestion.scope),
    processed: ingestionCounterSchema.parse(ingestion.processed ?? 0),
    createdObservations: ingestionCounterSchema.parse(ingestion.createdObservations ?? 0),
    skipped: ingestionCounterSchema.parse(ingestion.skipped ?? 0),
    errors: ingestionCounterSchema.parse(ingestion.errors ?? 0),
  };
}

export function createIngestionRepository(database: Kysely<Database>): IngestionRepository {
  return {
    async getByID(id: string): Promise<IngestionRecord | null> {
      const ingestion = await database
        .selectFrom("ingestion")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      return ingestion ? normalizeIngestion(ingestion) : null;
    },

    async create(ingestion: CreateIngestionRecord): Promise<IngestionRecord> {
      const created = await database
        .insertInto("ingestion")
        .values(normalizeIngestionInput(ingestion) as Insertable<IngestionTable>)
        .returningAll()
        .executeTakeFirstOrThrow();

      return normalizeIngestion(created);
    },

    async updateSummaryByID(
      id: string,
      summary: Pick<IngestionTable, "processed" | "createdObservations" | "skipped" | "errors">,
    ): Promise<IngestionRecord | null> {
      const normalizedSummary = {
        processed: ingestionCounterSchema.parse(summary.processed),
        createdObservations: ingestionCounterSchema.parse(summary.createdObservations),
        skipped: ingestionCounterSchema.parse(summary.skipped),
        errors: ingestionCounterSchema.parse(summary.errors),
      };
      const updated = await database
        .updateTable("ingestion")
        .set(normalizedSummary)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return updated ? normalizeIngestion(updated) : null;
    },
  };
}
