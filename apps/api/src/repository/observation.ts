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
  Partial<
    Pick<
      ObservationTable,
      | "title"
      | "description"
      | "evidence"
      | "remediation"
      | "severity"
      | "observedAt"
      | "updatedAt"
      | "updatedBy"
    >
  >,
  "weakness" | "affectedResource"
> & {
  weakness?: unknown;
  affectedResource?: unknown;
  updatedAt: Date;
  updatedBy: string;
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

export interface UpdateObservationAndTouchFindingInput {
  findingId: string;
  observationId: string;
  observation: UpdateObservationRecord;
}

export interface UpdateObservationAndTouchFindingResult {
  previousObservation: ObservationRecord;
  observation: ObservationRecord;
  previous: FindingProjection;
  current: FindingProjection;
}

export interface DeleteObservationAndTouchFindingInput {
  findingId: string;
  observationId: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface DeleteObservationAndTouchFindingResult {
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
  updateAndTouchFinding(
    input: UpdateObservationAndTouchFindingInput,
  ): Promise<UpdateObservationAndTouchFindingResult | null>;
  deleteAndTouchFinding(
    input: DeleteObservationAndTouchFindingInput,
  ): Promise<DeleteObservationAndTouchFindingResult | null>;
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

    async updateAndTouchFinding(
      input: UpdateObservationAndTouchFindingInput,
    ): Promise<UpdateObservationAndTouchFindingResult | null> {
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

        const previousObservation = await transaction
          .selectFrom("observation")
          .selectAll()
          .where("id", "=", input.observationId)
          .where("findingId", "=", input.findingId)
          .executeTakeFirst();
        if (!previousObservation) {
          return null;
        }

        const updatedObservation = await transaction
          .updateTable("observation")
          .set(normalizeObservationInput(input.observation) as Updateable<ObservationTable>)
          .where("id", "=", input.observationId)
          .where("findingId", "=", input.findingId)
          .returningAll()
          .executeTakeFirst();
        if (!updatedObservation) {
          return null;
        }

        await transaction
          .updateTable("finding")
          .set({
            updatedAt: input.observation.updatedAt,
            updatedBy: input.observation.updatedBy,
          })
          .where("id", "=", input.findingId)
          .executeTakeFirstOrThrow();

        const current = await getFindingProjectionByID(transaction, input.findingId);
        if (!current) {
          throw new Error("updated finding was not available as a projection");
        }

        return {
          previousObservation: normalizeObservation(previousObservation),
          observation: normalizeObservation(updatedObservation),
          previous,
          current,
        };
      });
    },

    async deleteAndTouchFinding(
      input: DeleteObservationAndTouchFindingInput,
    ): Promise<DeleteObservationAndTouchFindingResult | null> {
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

        const deletedObservation = await transaction
          .deleteFrom("observation")
          .where("id", "=", input.observationId)
          .where("findingId", "=", input.findingId)
          .returningAll()
          .executeTakeFirst();
        if (!deletedObservation) {
          return null;
        }

        await transaction
          .updateTable("finding")
          .set({
            updatedAt: input.updatedAt,
            updatedBy: input.updatedBy,
          })
          .where("id", "=", input.findingId)
          .executeTakeFirstOrThrow();

        const current = await getFindingProjectionByID(transaction, input.findingId);
        if (!current) {
          throw new Error("updated finding was not available as a projection");
        }

        return {
          observation: normalizeObservation(deletedObservation),
          previous,
          current,
        };
      });
    },
  };
}
