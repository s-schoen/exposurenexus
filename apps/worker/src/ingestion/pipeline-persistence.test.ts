import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";

import { createBackendRuntime } from "@exposurenexus/backend";
import { createAssets } from "@exposurenexus/backend/assets";
import { createFindings } from "@exposurenexus/backend/findings";
import { createImportSources } from "@exposurenexus/backend/import-sources";
import { createIngestions } from "@exposurenexus/backend/ingestions";
import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset-identifier";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { ScannerSource } from "@exposurenexus/contracts/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { identifierInventorySnapshotFrom } from "../classification/asset-classifiers/asset-inventory-adapter.js";
import { IdentifierAssetMatcher } from "../classification/asset-classifiers/identifier-matcher.js";
import { findingIdentitySourceFrom } from "../classification/finding-classifiers/finding-identity-adapter.js";
import { IdentityFindingMatcher } from "../classification/finding-classifiers/identity-matcher.js";
import { createScannerClassifier } from "../classification/normalizers/registry.js";
import { createTestDatabase } from "../test/database.js";
import { recordingLogger } from "../test/logger.js";
import { createIngestionPipeline, parseFailedCode } from "./pipeline.js";

import type { ObjectStorage } from "@exposurenexus/backend/object-storage";

const actorId = "5d0f1c2e-8f4b-4c3a-9e6d-7a1b2c3d4e5f";
const seededAt = new Date("2026-09-01T00:00:00.000Z");
const fixture = readFileSync(
  new URL("../classification/normalizers/fixtures/juiceshop.nuclei.jsonl", import.meta.url),
  "utf8",
);
const fixtureRecords = fixture.trimEnd().split("\n");
// One fixture record moved to a host that no seeded asset identifies.
const unseededRecord = fixtureRecords[0]
  .replaceAll("localhost", "unseeded.example.test")
  .replaceAll("127.0.0.1", "192.0.2.10");
const scan = `${[...fixtureRecords, unseededRecord].join("\n")}\n`;

describe("ingestion pipeline end to end", () => {
  const testDb = createTestDatabase();
  const objects = new Map<string, Buffer>();
  const storage = {
    bucket: "scan-inputs",
    async write({ key, body }) {
      objects.set(key, await buffer(body));
    },
    async read(key) {
      const bytes = objects.get(key);
      if (!bytes) throw new Error("missing test input");
      return Readable.from([bytes]);
    },
    async delete(key) {
      objects.delete(key);
    },
    close() {},
  } satisfies ObjectStorage;
  let assetId: string;
  let mitigatedFindingId: string;

  beforeAll(async () => {
    await testDb.start();
    const db = testDb.db;
    await db
      .insertInto("user_profile")
      .values({
        id: actorId,
        username: "scan-importer",
        email: "scan-importer@example.test",
        displayName: "Scan Importer",
        enabled: true,
        passwordHash: "unused",
      })
      .execute();
    const audit = {
      createdAt: seededAt,
      updatedAt: seededAt,
      createdBy: actorId,
      updatedBy: actorId,
    };
    ({ id: assetId } = await db
      .insertInto("asset")
      .values({
        displayName: "Juice Shop",
        type: AssetType.Host,
        environment: AssetEnvironment.Development,
        lifecycleState: AssetLifecycleState.Active,
        ownerId: null,
        ...audit,
      })
      .returning("id")
      .executeTakeFirstOrThrow());
    await db
      .insertInto("asset_identifier")
      .values({ assetId, type: AssetIdentifierType.DnsName, namespace: null, value: "localhost" })
      .execute();
    ({ id: mitigatedFindingId } = await db
      .insertInto("finding")
      .values({
        assetId,
        title: "Public Swagger API",
        severity: VulnerabilitySeverity.Low,
        status: FindingStatus.Mitigated,
        assigneeId: null,
        dueDate: null,
        mitigation: "API docs removed from the public route.",
        weakness: { identifiers: { nuclei: ["swagger-api"], cwe: ["CWE-200"] } },
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          scheme: "http",
          host: "localhost",
          port: 8080,
          path: "/api-docs/swagger.yaml",
          method: "GET",
          component: { kind: WebEndpointComponentKind.Endpoint },
        },
        ...audit,
      })
      .returning("id")
      .executeTakeFirstOrThrow());
  });

  afterAll(async () => await testDb.dispose());

  function setup() {
    const runtime = createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) });
    const importSources = createImportSources(runtime, storage);
    const ingestions = createIngestions(runtime, importSources);
    const logger = recordingLogger();
    // Composed as in bootstrap.ts, over the real backend capabilities.
    const pipeline = createIngestionPipeline({
      ingestions,
      classifier: createScannerClassifier(logger),
      createAssetMatcher: () =>
        new IdentifierAssetMatcher(
          identifierInventorySnapshotFrom(createAssets(runtime).inventory),
        ),
      findingMatcher: new IdentityFindingMatcher(
        findingIdentitySourceFrom(createFindings(runtime)),
      ),
    });

    async function submit(contents: string) {
      const bytes = Buffer.from(contents);
      const registered = await importSources.register({
        source: ScannerSource.Nuclei,
        sizeBytes: bytes.length,
        originalFilename: "juiceshop.nuclei.jsonl",
        performedBy: actorId,
      });
      const { ingestionId } = await ingestions.submit({
        importSourceId: registered.id,
        performedBy: actorId,
        body: Readable.from([bytes]),
        signal: new AbortController().signal,
      });
      return ingestionId;
    }

    return { pipeline, logger, submit };
  }

  async function snapshot() {
    return {
      ingestions: await testDb.db.selectFrom("ingestion").selectAll().orderBy("id").execute(),
      findings: await testDb.db.selectFrom("finding").selectAll().orderBy("id").execute(),
      observations: await testDb.db.selectFrom("observation").selectAll().orderBy("id").execute(),
    };
  }

  it("records a fixture scan as observations on new and reopened findings, exactly once", async () => {
    const { pipeline, logger, submit } = setup();
    const ingestionId = await submit(scan);

    await pipeline.run(ingestionId, logger);

    const recorded = await snapshot();
    const ingestion = recorded.ingestions.find(({ id }) => id === ingestionId);
    expect(ingestion).toMatchObject({ status: "completed", failureCode: null });
    expect(ingestion?.processedAt).toBeInstanceOf(Date);

    // Every fixture record became one observation; the unseeded record created nothing.
    expect(recorded.observations).toHaveLength(fixtureRecords.length);
    for (const observation of recorded.observations) {
      expect(observation).toMatchObject({
        ingestionId,
        source: ScannerSource.Nuclei,
        fingerprints: {},
        createdBy: actorId,
        updatedBy: actorId,
      });
      expect(observation.affectedResource).toMatchObject({ host: "localhost" });
    }
    expect(JSON.stringify(recorded)).not.toContain("unseeded.example.test");
    expect(logger.entries).toContainEqual({
      level: "warn",
      fields: expect.objectContaining({
        ingestionId,
        sourceRecord: `line:${fixtureRecords.length + 1}`,
        stage: "asset",
      }),
      message: "observation candidate unresolved",
    });

    // The scan reopened the mitigated finding and left its triage fields alone.
    const reopened = recorded.findings.find(({ id }) => id === mitigatedFindingId);
    expect(reopened).toMatchObject({
      status: FindingStatus.Active,
      mitigation: "API docs removed from the public route.",
      createdAt: seededAt,
      updatedBy: actorId,
    });
    expect(reopened?.updatedAt.getTime()).toBeGreaterThan(seededAt.getTime());
    expect(
      recorded.observations.filter(({ findingId }) => findingId === mitigatedFindingId),
    ).toMatchObject([
      {
        title: "Public Swagger API - Detect",
        observedAt: new Date("2026-09-16T18:10:36.869Z"),
        affectedResource: { reportedUrl: "http://localhost:8080/api-docs/swagger.yaml" },
      },
    ]);

    const created = recorded.findings.filter(({ id }) => id !== mitigatedFindingId);
    expect(created.length).toBeGreaterThan(0);
    for (const finding of created) {
      const observations = recorded.observations.filter(
        ({ findingId }) => findingId === finding.id,
      );
      expect(observations.length).toBeGreaterThan(0);
      expect(finding).toMatchObject({
        assetId,
        status: FindingStatus.Active,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        createdBy: actorId,
        updatedBy: actorId,
      });
      expect(finding.affectedResource).not.toHaveProperty("reportedUrl");
      expect(observations.map(({ title }) => title)).toContain(finding.title);
    }
    expect(created).toContainEqual(
      expect.objectContaining({
        title: "Prometheus Metrics - Detect",
        severity: VulnerabilitySeverity.Medium,
        weakness: expect.objectContaining({
          identifiers: { cwe: ["CWE-200"], nuclei: ["prometheus-metrics"] },
        }),
        affectedResource: {
          type: AffectedResourceType.WebEndpoint,
          scheme: "http",
          host: "localhost",
          port: 8080,
          path: "/metrics",
          method: "GET",
          component: { kind: WebEndpointComponentKind.Endpoint },
        },
      }),
    );

    // Redelivery of the same ingestion changes nothing.
    await pipeline.run(ingestionId, logger);

    expect(await snapshot()).toEqual(recorded);
    expect(logger.entries.at(-1)).toMatchObject({
      level: "info",
      fields: { ingestionId, status: "completed" },
      message: "ingestion already processed",
    });
  });

  it("fails an ingestion whose source file cannot be parsed, recording nothing", async () => {
    const { pipeline, logger, submit } = setup();
    const ingestionId = await submit(`${fixtureRecords[0]}\n{"template-id": \n`);
    const before = await snapshot();

    await pipeline.run(ingestionId, logger);

    const after = await snapshot();
    const ingestion = after.ingestions.find(({ id }) => id === ingestionId);
    expect(ingestion).toMatchObject({ status: "failed", failureCode: parseFailedCode });
    expect(ingestion?.processedAt).toBeInstanceOf(Date);
    expect(after.findings).toEqual(before.findings);
    expect(after.observations).toEqual(before.observations);
  });
});
