import { observationAffectedResourceSchema } from "@exposurenexus/contracts/model/affected-resource";
import { observationSchema, type Observation } from "@exposurenexus/contracts/model/observation";
import { weaknessSchema } from "@exposurenexus/contracts/model/weakness";

import { getFindingProjectionByID } from "./finding-projection.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { ObservationTable } from "../database/schema/observation.js";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { Insertable, Selectable } from "kysely";

export type ObservationRecord = Observation;
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

function normalizeObservation(observation: Selectable<ObservationTable>): ObservationRecord {
  return observationSchema.parse(observation);
}

function normalizedObservationValues(
  observation: CreateObservationRecord,
): CreateObservationRecord {
  return {
    ...observation,
    weakness: weaknessSchema.parse(observation.weakness),
    affectedResource: observationAffectedResourceSchema.parse(observation.affectedResource),
  };
}

function normalizedObservationUpdate(
  observation: UpdateObservationRecord,
): UpdateObservationRecord {
  return {
    ...observation,
    ...(observation.weakness === undefined
      ? {}
      : { weakness: weaknessSchema.parse(observation.weakness) }),
    ...(observation.affectedResource === undefined
      ? {}
      : {
          affectedResource: observationAffectedResourceSchema.parse(observation.affectedResource),
        }),
  };
}

export async function listObservations(
  database: DatabaseExecutor,
  findingId: string,
): Promise<ObservationRecord[]> {
  const observations = await database
    .selectFrom("observation")
    .selectAll()
    .where("findingId", "=", findingId)
    .orderBy("observedAt", "desc")
    .orderBy("id", "desc")
    .execute();

  return observations.map(normalizeObservation);
}

export async function insertObservation(
  database: DatabaseExecutor,
  observation: CreateObservationRecord,
): Promise<ObservationRecord> {
  const created = await database
    .insertInto("observation")
    .values(normalizedObservationValues(observation))
    .returningAll()
    .executeTakeFirstOrThrow();

  return normalizeObservation(created);
}

export async function createObservationAndTouchFinding(
  database: DatabaseExecutor,
  input: CreateObservationAndTouchFindingInput,
): Promise<CreateObservationAndTouchFindingResult | null> {
  const parent = await database
    .selectFrom("finding")
    .select("id")
    .where("id", "=", input.findingId)
    .forUpdate()
    .executeTakeFirst();
  if (!parent) {
    return null;
  }

  const previous = await getFindingProjectionByID(database, input.findingId);
  if (!previous) {
    throw new Error("locked finding was not available as a projection");
  }

  const observationInput = input.buildObservation(previous);
  if (observationInput.findingId !== input.findingId) {
    throw new Error("observation does not belong to the locked finding");
  }

  const observation = await insertObservation(database, observationInput);
  await database
    .updateTable("finding")
    .set({
      updatedAt: observationInput.updatedAt,
      updatedBy: observationInput.updatedBy,
    })
    .where("id", "=", input.findingId)
    .executeTakeFirstOrThrow();

  const current = await getFindingProjectionByID(database, input.findingId);
  if (!current) {
    throw new Error("updated finding was not available as a projection");
  }

  return { observation, previous, current };
}

export async function updateObservationAndTouchFinding(
  database: DatabaseExecutor,
  input: UpdateObservationAndTouchFindingInput,
): Promise<UpdateObservationAndTouchFindingResult | null> {
  const parent = await database
    .selectFrom("finding")
    .select("id")
    .where("id", "=", input.findingId)
    .forUpdate()
    .executeTakeFirst();
  if (!parent) {
    return null;
  }

  const previous = await getFindingProjectionByID(database, input.findingId);
  if (!previous) {
    throw new Error("locked finding was not available as a projection");
  }

  const previousObservation = await database
    .selectFrom("observation")
    .selectAll()
    .where("id", "=", input.observationId)
    .where("findingId", "=", input.findingId)
    .executeTakeFirst();
  if (!previousObservation) {
    return null;
  }

  const observation = await database
    .updateTable("observation")
    .set(normalizedObservationUpdate(input.observation))
    .where("id", "=", input.observationId)
    .where("findingId", "=", input.findingId)
    .returningAll()
    .executeTakeFirst();
  if (!observation) {
    return null;
  }

  await database
    .updateTable("finding")
    .set({
      updatedAt: input.observation.updatedAt,
      updatedBy: input.observation.updatedBy,
    })
    .where("id", "=", input.findingId)
    .executeTakeFirstOrThrow();

  const current = await getFindingProjectionByID(database, input.findingId);
  if (!current) {
    throw new Error("updated finding was not available as a projection");
  }

  return {
    previousObservation: normalizeObservation(previousObservation),
    observation: normalizeObservation(observation),
    previous,
    current,
  };
}

export async function deleteObservationAndTouchFinding(
  database: DatabaseExecutor,
  input: DeleteObservationAndTouchFindingInput,
): Promise<DeleteObservationAndTouchFindingResult | null> {
  const parent = await database
    .selectFrom("finding")
    .select("id")
    .where("id", "=", input.findingId)
    .forUpdate()
    .executeTakeFirst();
  if (!parent) {
    return null;
  }

  const previous = await getFindingProjectionByID(database, input.findingId);
  if (!previous) {
    throw new Error("locked finding was not available as a projection");
  }

  const observation = await database
    .deleteFrom("observation")
    .where("id", "=", input.observationId)
    .where("findingId", "=", input.findingId)
    .returningAll()
    .executeTakeFirst();
  if (!observation) {
    return null;
  }

  await database
    .updateTable("finding")
    .set({ updatedAt: input.updatedAt, updatedBy: input.updatedBy })
    .where("id", "=", input.findingId)
    .executeTakeFirstOrThrow();

  const current = await getFindingProjectionByID(database, input.findingId);
  if (!current) {
    throw new Error("updated finding was not available as a projection");
  }

  return {
    observation: normalizeObservation(observation),
    previous,
    current,
  };
}

export async function moveObservationAndTouchFindings(
  database: DatabaseExecutor,
  input: MoveObservationAndTouchFindingsInput,
): Promise<MoveObservationAndTouchFindingsResult | null> {
  if (input.findingId === input.targetFindingId) {
    return null;
  }

  // Stable lock order prevents concurrent moves from deadlocking.
  const parentIds = [input.findingId, input.targetFindingId].sort();
  const parents = await database
    .selectFrom("finding")
    .select("id")
    .where("id", "in", parentIds)
    .orderBy("id", "asc")
    .forUpdate()
    .execute();
  if (parents.length !== parentIds.length) {
    return null;
  }

  const sourcePrevious = await getFindingProjectionByID(database, input.findingId);
  const targetPrevious = await getFindingProjectionByID(database, input.targetFindingId);
  if (!sourcePrevious || !targetPrevious) {
    throw new Error("locked finding was not available as a projection");
  }

  const previousObservation = await database
    .selectFrom("observation")
    .selectAll()
    .where("id", "=", input.observationId)
    .where("findingId", "=", input.findingId)
    .executeTakeFirst();
  if (!previousObservation) {
    return null;
  }

  const observation = await database
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
  if (!observation) {
    return null;
  }

  await database
    .updateTable("finding")
    .set({ updatedAt: input.updatedAt, updatedBy: input.updatedBy })
    .where("id", "in", parentIds)
    .execute();

  const sourceCurrent = await getFindingProjectionByID(database, input.findingId);
  const targetCurrent = await getFindingProjectionByID(database, input.targetFindingId);
  if (!sourceCurrent || !targetCurrent) {
    throw new Error("updated findings were not available as projections");
  }

  return {
    previousObservation: normalizeObservation(previousObservation),
    observation: normalizeObservation(observation),
    sourcePrevious,
    sourceCurrent,
    targetPrevious,
    targetCurrent,
  };
}
