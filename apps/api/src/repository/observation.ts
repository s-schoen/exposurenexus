import {
  observationAffectedResourceSchema,
  type ObservationAffectedResource,
} from "@exposurenexus/types/model/affected-resource";
import { observationSchema } from "@exposurenexus/types/model/observation";
import { observationWeaknessSchema, type Weakness } from "@exposurenexus/types/model/weakness";

import { getFindingProjectionByID } from "./finding-persistence.js";

import type { Database } from "../db/index.js";
import type { ObservationTable } from "../db/schema/observation.js";
import type { FindingProjection } from "@exposurenexus/types/model/finding";
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

export interface CreateObservationAndTouchFindingInput {
  findingId: string;
  buildObservation: (previous: FindingProjection) => CreateObservationRecord;
}

export interface CreateObservationAndTouchFindingResult {
  observation: ObservationRecord;
  previous: FindingProjection;
  current: FindingProjection;
}

export interface ObservationRepository {
  listByFindingID(findingId: string): Promise<ObservationRecord[]>;
  getByID(id: string): Promise<ObservationRecord | null>;
  create(observation: CreateObservationRecord): Promise<ObservationRecord>;
  createAndTouchFinding(
    input: CreateObservationAndTouchFindingInput,
  ): Promise<CreateObservationAndTouchFindingResult | null>;
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

    async createAndTouchFinding(
      input: CreateObservationAndTouchFindingInput,
    ): Promise<CreateObservationAndTouchFindingResult | null> {
      return await database.transaction().execute(async (transaction) => {
        const parent = await transaction
          .selectFrom("finding")
          .select("id")
          .where("id", "=", input.findingId)
          .forUpdate()
          .executeTakeFirst();
        if (!parent) {
          return null;
        }

        const previous = await getFindingProjectionByID(transaction, input.findingId);
        if (!previous) {
          throw new Error("locked finding was not available as a projection");
        }

        const observationInput = input.buildObservation(previous);
        if (observationInput.findingId !== input.findingId) {
          throw new Error("observation does not belong to the locked finding");
        }
        const created = await transaction
          .insertInto("observation")
          .values(normalizeObservationInput(observationInput) as Insertable<ObservationTable>)
          .returningAll()
          .executeTakeFirstOrThrow();

        await transaction
          .updateTable("finding")
          .set({
            updatedAt: observationInput.updatedAt,
            updatedBy: observationInput.updatedBy,
          })
          .where("id", "=", input.findingId)
          .executeTakeFirstOrThrow();

        const current = await getFindingProjectionByID(transaction, input.findingId);
        if (!current) {
          throw new Error("updated finding was not available as a projection");
        }

        return {
          observation: normalizeObservation(created),
          previous,
          current,
        };
      });
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
