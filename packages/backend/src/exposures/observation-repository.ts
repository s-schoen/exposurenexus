import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { observationSchema, type Observation } from "@exposurenexus/contracts/model/observation";
import { weaknessSchema } from "@exposurenexus/contracts/model/weakness";

import { getFindingProjectionByID } from "./finding-repository.js";

import type { Database } from "../database/index.js";
import type { ObservationTable } from "../database/index.js";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { Kysely, Insertable, Selectable } from "kysely";

type ObservationRecord = Observation;
export type CreateObservationRecord = Insertable<ObservationTable>;
export type UpdateObservationRecord = Partial<
  Pick<
    ObservationTable,
    | "title"
    | "description"
    | "evidence"
    | "remediation"
    | "severity"
    | "weakness"
    | "affectedResource"
    | "observedAt"
  >
> &
  Pick<ObservationTable, "updatedAt" | "updatedBy">;

export interface CreateObservationAndTouchFindingInput {
  findingId: string;
  buildObservation: (previous: Finding) => CreateObservationRecord;
}

export interface CreateObservationAndTouchFindingResult {
  observation: ObservationRecord;
  previous: Finding;
  current: Finding;
}

export interface UpdateObservationAndTouchFindingInput {
  findingId: string;
  observationId: string;
  observation: UpdateObservationRecord;
}

export interface UpdateObservationAndTouchFindingResult {
  previousObservation: ObservationRecord;
  observation: ObservationRecord;
  previous: Finding;
  current: Finding;
}

export interface DeleteObservationAndTouchFindingInput {
  findingId: string;
  observationId: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface DeleteObservationAndTouchFindingResult {
  observation: ObservationRecord;
  previous: Finding;
  current: Finding;
}

export interface MoveObservationAndTouchFindingsInput {
  findingId: string;
  observationId: string;
  targetFindingId: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface MoveObservationAndTouchFindingsResult {
  previousObservation: ObservationRecord;
  observation: ObservationRecord;
  sourcePrevious: Finding;
  sourceCurrent: Finding;
  targetPrevious: Finding;
  targetCurrent: Finding;
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
  moveAndTouchFindings(
    input: MoveObservationAndTouchFindingsInput,
  ): Promise<MoveObservationAndTouchFindingsResult | null>;
}

function normalizeObservation(observation: Selectable<ObservationTable>): ObservationRecord {
  return observationSchema.parse(observation);
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
        .values({
          ...observation,
          weakness: weaknessSchema.parse(observation.weakness),
          affectedResource: observationAffectedResourceSchema.parse(observation.affectedResource),
        })
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
          .values({
            ...observationInput,
            weakness: weaknessSchema.parse(observationInput.weakness),
            affectedResource: observationAffectedResourceSchema.parse(
              observationInput.affectedResource,
            ),
          })
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
          .set({
            ...input.observation,
            ...(input.observation.weakness === undefined
              ? {}
              : { weakness: weaknessSchema.parse(input.observation.weakness) }),
            ...(input.observation.affectedResource === undefined
              ? {}
              : {
                  affectedResource: observationAffectedResourceSchema.parse(
                    input.observation.affectedResource,
                  ),
                }),
          })
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

    async moveAndTouchFindings(
      input: MoveObservationAndTouchFindingsInput,
    ): Promise<MoveObservationAndTouchFindingsResult | null> {
      if (input.findingId === input.targetFindingId) {
        return null;
      }

      return await database.transaction().execute(async (transaction) => {
        // Stable lock order prevents concurrent moves from deadlocking.
        const parentIds = [input.findingId, input.targetFindingId].sort();
        const parents = await transaction
          .selectFrom("finding")
          .select("id")
          .where("id", "in", parentIds)
          .orderBy("id", "asc")
          .forUpdate()
          .execute();
        if (parents.length !== parentIds.length) {
          return null;
        }

        const sourcePrevious = await getFindingProjectionByID(transaction, input.findingId);
        const targetPrevious = await getFindingProjectionByID(transaction, input.targetFindingId);
        if (!sourcePrevious || !targetPrevious) {
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
          .set({
            findingId: input.targetFindingId,
            updatedAt: input.updatedAt,
            updatedBy: input.updatedBy,
          })
          .where("id", "=", input.observationId)
          .where("findingId", "=", input.findingId)
          .returningAll()
          .executeTakeFirst();
        if (!updatedObservation) {
          return null;
        }

        await transaction
          .updateTable("finding")
          .set({ updatedAt: input.updatedAt, updatedBy: input.updatedBy })
          .where("id", "in", parentIds)
          .execute();

        const sourceCurrent = await getFindingProjectionByID(transaction, input.findingId);
        const targetCurrent = await getFindingProjectionByID(transaction, input.targetFindingId);
        if (!sourceCurrent || !targetCurrent) {
          throw new Error("updated findings were not available as projections");
        }

        return {
          previousObservation: normalizeObservation(previousObservation),
          observation: normalizeObservation(updatedObservation),
          sourcePrevious,
          sourceCurrent,
          targetPrevious,
          targetCurrent,
        };
      });
    },
  };
}
