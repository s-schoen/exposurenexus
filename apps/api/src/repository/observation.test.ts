import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { ObservationSource } from "@exposurenexus/contracts/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../test/db.js";
import { createAssetRepository } from "./asset.js";
import { createFindingRepository } from "./finding.js";
import { createObservationRepository } from "./observation.js";

describe("observation repository transactions", () => {
  const testDb = createTestDatabase();
  const actorId = "85196743-cfba-4afb-b286-d36be32a64a4";
  const originalTime = new Date("2026-08-16T10:00:00.000Z");
  const updateTime = new Date("2026-08-17T10:00:00.000Z");

  beforeAll(() => testDb.start());
  afterAll(() => testDb.dispose());
  beforeEach(async () => {
    await resetTestDatabase(testDb.db);
    await testDb.db
      .insertInto("user_profile")
      .values({
        id: actorId,
        username: "tester",
        displayName: "Test User",
        email: "tester@example.com",
        enabled: true,
        passwordHash: "password-hash",
      })
      .execute();
  });

  async function createParents() {
    const asset = await createAssetRepository(testDb.db).create({
      displayName: "api.exposurenexus.local",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy: actorId,
      updatedBy: actorId,
    });
    const findings = createFindingRepository(testDb.db);
    const createFinding = (title: string) =>
      findings.create({
        assetId: asset.id,
        title,
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Confirmed,
        assigneeId: null,
        dueDate: null,
        mitigation: "Preserve workflow",
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        createdAt: originalTime,
        updatedAt: originalTime,
        createdBy: actorId,
        updatedBy: actorId,
      });
    return {
      findings,
      source: await createFinding("Source"),
      target: await createFinding("Target"),
    };
  }

  function observationInput(findingId: string) {
    return {
      findingId,
      ingestionId: null,
      source: ObservationSource.Manual,
      title: "Manual observation",
      description: null,
      evidence: "Evidence",
      remediation: null,
      severity: VulnerabilitySeverity.Low,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified as const },
      observedAt: originalTime,
      createdAt: originalTime,
      updatedAt: originalTime,
      createdBy: actorId,
      updatedBy: actorId,
    };
  }

  it("isolates updates and deletes from observations owned by another parent", async () => {
    const { findings, source, target } = await createParents();
    const repository = createObservationRepository(testDb.db);
    const observation = await repository.create(observationInput(source.id));

    await expect(
      repository.updateAndTouchFinding({
        findingId: target.id,
        observationId: observation.id,
        observation: { title: "Wrong parent", updatedAt: updateTime, updatedBy: actorId },
      }),
    ).resolves.toBeNull();
    await expect(
      repository.deleteAndTouchFinding({
        findingId: target.id,
        observationId: observation.id,
        updatedAt: updateTime,
        updatedBy: actorId,
      }),
    ).resolves.toBeNull();

    await expect(repository.getByID(observation.id)).resolves.toEqual(observation);
    await expect(findings.getByID(target.id)).resolves.toMatchObject({ updatedAt: originalTime });
  });

  it.each(["create", "update", "delete"] as const)(
    "returns null when the %s parent is missing",
    async (operation) => {
      const repository = createObservationRepository(testDb.db);
      const missingFindingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
      const parents = operation === "create" ? null : await createParents();
      const observation =
        parents === null ? null : await repository.create(observationInput(parents.source.id));
      const observationId = observation?.id ?? "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
      const result =
        operation === "create"
          ? repository.createAndTouchFinding({
              findingId: missingFindingId,
              buildObservation: () => observationInput(missingFindingId),
            })
          : operation === "update"
            ? repository.updateAndTouchFinding({
                findingId: missingFindingId,
                observationId,
                observation: { updatedAt: updateTime, updatedBy: actorId },
              })
            : repository.deleteAndTouchFinding({
                findingId: missingFindingId,
                observationId,
                updatedAt: updateTime,
                updatedBy: actorId,
              });

      await expect(result).resolves.toBeNull();
      if (observation) {
        await expect(repository.getByID(observation.id)).resolves.toEqual(observation);
      }
    },
  );

  it("rolls back when the observation builder returns a different finding id", async () => {
    const { findings, source, target } = await createParents();
    const repository = createObservationRepository(testDb.db);

    await expect(
      repository.createAndTouchFinding({
        findingId: source.id,
        buildObservation: () => observationInput(target.id),
      }),
    ).rejects.toThrow("observation does not belong to the locked finding");
    await expect(repository.listByFindingID(source.id)).resolves.toEqual([]);
    await expect(findings.getByID(source.id)).resolves.toMatchObject({ updatedAt: originalTime });
  });

  it.each(["update", "delete"] as const)(
    "rolls back an observation %s when touching its parent fails",
    async (operation) => {
      const { findings, source } = await createParents();
      const repository = createObservationRepository(testDb.db);
      const observation = await repository.create(observationInput(source.id));
      await sql`create function fail_observation_parent_touch() returns trigger as $$ begin raise exception 'parent touch failed'; end; $$ language plpgsql`.execute(
        testDb.db,
      );
      await sql`create trigger fail_observation_parent_touch before update on finding for each row execute function fail_observation_parent_touch()`.execute(
        testDb.db,
      );

      try {
        const mutation =
          operation === "update"
            ? repository.updateAndTouchFinding({
                findingId: source.id,
                observationId: observation.id,
                observation: { title: "Must roll back", updatedAt: updateTime, updatedBy: actorId },
              })
            : repository.deleteAndTouchFinding({
                findingId: source.id,
                observationId: observation.id,
                updatedAt: updateTime,
                updatedBy: actorId,
              });
        await expect(mutation).rejects.toThrow("parent touch failed");
        await expect(repository.getByID(observation.id)).resolves.toEqual(observation);
        await expect(findings.getByID(source.id)).resolves.toMatchObject({
          updatedAt: originalTime,
        });
      } finally {
        await sql`drop trigger fail_observation_parent_touch on finding`.execute(testDb.db);
        await sql`drop function fail_observation_parent_touch()`.execute(testDb.db);
      }
    },
  );
});
