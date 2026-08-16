import {
  observationAffectedResourceSchema,
  type ObservationAffectedResource,
} from "@exposurenexus/types/model/affected-resource";
import { observationSchema } from "@exposurenexus/types/model/observation";
import { observationWeaknessSchema, type Weakness } from "@exposurenexus/types/model/weakness";

import type { Database } from "../db/index.js";
import type { ObservationTable } from "../db/schema/observation.js";
import type { Kysely, Insertable, Selectable, Updateable } from "kysely";

export type ObservationRecord = Selectable<ObservationTable>;
export type CreateObservationRecord = Omit<
  Insertable<ObservationTable>,
  "weakness" | "affectedResource"
> & {
  weakness: unknown;
  affectedResource: unknown;
};
export type UpdateObservationRecord = Omit<
  Updateable<ObservationTable>,
  "weakness" | "affectedResource"
> & {
  weakness?: unknown;
  affectedResource?: unknown;
};

export interface ObservationRepository {
  listByFindingID(findingId: string): Promise<ObservationRecord[]>;
  getByID(id: string): Promise<ObservationRecord | null>;
  create(observation: CreateObservationRecord): Promise<ObservationRecord>;
  updateByID(id: string, observation: UpdateObservationRecord): Promise<ObservationRecord | null>;
  deleteByID(id: string): Promise<ObservationRecord | null>;
}

function normalizeObservation(observation: ObservationRecord): ObservationRecord {
  return observationSchema.parse(observation) as ObservationRecord;
}

function normalizeObservationInput<T extends { weakness?: unknown; affectedResource?: unknown }>(
  observation: T,
): T {
  return {
    ...observation,
    ...(observation.weakness === undefined
      ? {}
      : { weakness: observationWeaknessSchema.parse(observation.weakness) as Weakness }),
    ...(observation.affectedResource === undefined
      ? {}
      : {
          affectedResource: observationAffectedResourceSchema.parse(
            observation.affectedResource,
          ) as ObservationAffectedResource,
        }),
  };
}

export function createObservationRepository(database: Kysely<Database>): ObservationRepository {
  return {
    async listByFindingID(findingId: string): Promise<ObservationRecord[]> {
      const observations = await database
        .selectFrom("observation")
        .selectAll()
        .where("findingId", "=", findingId)
        .orderBy("observedAt", "desc")
        .orderBy("id", "desc")
        .execute();

      return observations.map(normalizeObservation);
    },

    async getByID(id: string): Promise<ObservationRecord | null> {
      const observation = await database
        .selectFrom("observation")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      return observation ? normalizeObservation(observation) : null;
    },

    async create(observation: CreateObservationRecord): Promise<ObservationRecord> {
      const created = await database
        .insertInto("observation")
        .values(normalizeObservationInput(observation) as Insertable<ObservationTable>)
        .returningAll()
        .executeTakeFirstOrThrow();

      return normalizeObservation(created);
    },

    async updateByID(
      id: string,
      observation: UpdateObservationRecord,
    ): Promise<ObservationRecord | null> {
      const updated = await database
        .updateTable("observation")
        .set(normalizeObservationInput(observation) as Updateable<ObservationTable>)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return updated ? normalizeObservation(updated) : null;
    },

    async deleteByID(id: string): Promise<ObservationRecord | null> {
      const deleted = await database
        .deleteFrom("observation")
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();

      return deleted ? normalizeObservation(deleted) : null;
    },
  };
}
