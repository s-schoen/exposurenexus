import { randomUUID } from "node:crypto";

import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { ObservationSource } from "@exposurenexus/contracts/model/observation";
import { z } from "zod/v4";

import { ApplicationError } from "../../application-error.js";

import type { Database } from "../../database/index.js";
import type { FindingTable } from "../findings/finding-table.js";
import type { ObservationTable } from "../findings/observation-table.js";
import type { ValidIngestionPlan } from "./ingestion-plan.js";
import type { Insertable, Transaction } from "kysely";

export type RecordedIngestion =
  | {
      status: "recorded";
      createdFindingIds: string[];
      attachedObservations: number;
      reopenedFindingIds: string[];
    }
  | { status: "already_processed" };

// Keeps every statement well below the Postgres limit of 65535 bind parameters.
const batchSize = 1000;
const reopenedStatuses: ReadonlySet<FindingStatus> = new Set([
  FindingStatus.Inactive,
  FindingStatus.Mitigated,
]);
const scannerSourceSchema = z.enum(ObservationSource).exclude(["Manual"]);

function* batches<T>(items: readonly T[]): Generator<T[]> {
  for (let start = 0; start < items.length; start += batchSize) {
    yield items.slice(start, start + batchSize);
  }
}

export async function recordIngestionPlan(
  transaction: Transaction<Database>,
  ingestionId: string,
  plan: ValidIngestionPlan,
): Promise<RecordedIngestion> {
  const ingestion = await transaction
    .selectFrom("ingestion")
    .select(["source", "createdBy", "status"])
    .where("id", "=", ingestionId)
    .forUpdate()
    .executeTakeFirst();
  if (!ingestion) {
    throw new ApplicationError({
      code: "ingestion.not_found",
      kind: "missing",
      message: "Ingestion does not exist",
      details: { ingestionId },
    });
  }
  if (ingestion.status !== "pending") return { status: "already_processed" };

  const stale = () =>
    new ApplicationError({
      code: "ingestion.plan_stale",
      kind: "conflict",
      message: "Ingestion plan no longer matches the stored assets and findings",
      details: { ingestionId },
    });

  // Locks are taken in ID order so concurrent writers cannot deadlock. A key-share lock keeps
  // each asset from being deleted without blocking edits to it.
  const assetIds = [
    ...new Set([
      ...plan.newFindings.map(({ assetId }) => assetId),
      ...plan.attachments.map(({ assetId }) => assetId),
    ]),
  ].sort();
  for (const ids of batches(assetIds)) {
    const assets = await transaction
      .selectFrom("asset")
      .select("id")
      .where("id", "in", ids)
      .orderBy("id")
      .forKeyShare()
      .execute();
    if (assets.length !== ids.length) throw stale();
  }

  const expectedAssetIds = new Map<string, string>();
  for (const { findingId, assetId } of plan.attachments) {
    if ((expectedAssetIds.get(findingId) ?? assetId) !== assetId) throw stale();
    expectedAssetIds.set(findingId, assetId);
  }
  const attachedFindingIds = [...expectedAssetIds.keys()].sort();
  const reopenedFindingIds: string[] = [];
  const touchedFindingIds: string[] = [];
  for (const ids of batches(attachedFindingIds)) {
    const findings = await transaction
      .selectFrom("finding")
      .select(["id", "assetId", "status"])
      .where("id", "in", ids)
      .orderBy("id")
      .forUpdate()
      .execute();
    if (findings.length !== ids.length) throw stale();
    for (const finding of findings) {
      if (finding.assetId !== expectedAssetIds.get(finding.id)) throw stale();
      (reopenedStatuses.has(finding.status) ? reopenedFindingIds : touchedFindingIds).push(
        finding.id,
      );
    }
  }

  const now = new Date();
  const audit = {
    createdAt: now,
    updatedAt: now,
    createdBy: ingestion.createdBy,
    updatedBy: ingestion.createdBy,
  };
  const source = scannerSourceSchema.parse(ingestion.source);

  // IDs are generated here so each new finding is paired with its observations without
  // relying on the row order of RETURNING.
  const newFindings = plan.newFindings.map((planned) => ({
    ...planned,
    id: randomUUID(),
  }));
  const findingRows: Insertable<FindingTable>[] = newFindings.map(({ id, assetId, finding }) => ({
    id,
    assetId,
    ...finding,
    status: FindingStatus.Active,
    assigneeId: null,
    dueDate: null,
    mitigation: null,
    ...audit,
  }));
  const observationRows: Insertable<ObservationTable>[] = [
    ...newFindings.map(({ id, observations }) => ({ findingId: id, observations })),
    ...plan.attachments,
  ].flatMap(({ findingId, observations }) =>
    observations.map((observation) => ({
      ...observation,
      findingId,
      ingestionId,
      source,
      ...audit,
    })),
  );

  for (const rows of batches(findingRows)) {
    await transaction.insertInto("finding").values(rows).execute();
  }
  for (const rows of batches(observationRows)) {
    await transaction.insertInto("observation").values(rows).execute();
  }
  for (const ids of batches(reopenedFindingIds)) {
    await transaction
      .updateTable("finding")
      .set({ status: FindingStatus.Active, updatedAt: now, updatedBy: ingestion.createdBy })
      .where("id", "in", ids)
      .execute();
  }
  for (const ids of batches(touchedFindingIds)) {
    await transaction
      .updateTable("finding")
      .set({ updatedAt: now, updatedBy: ingestion.createdBy })
      .where("id", "in", ids)
      .execute();
  }
  await transaction
    .updateTable("ingestion")
    .set({ status: "completed", processedAt: now })
    .where("id", "=", ingestionId)
    .execute();

  return {
    status: "recorded",
    createdFindingIds: newFindings.map(({ id }) => id),
    attachedObservations: plan.attachments.reduce(
      (count, { observations }) => count + observations.length,
      0,
    ),
    reopenedFindingIds,
  };
}
