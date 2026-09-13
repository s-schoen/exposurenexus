import { PGlite } from "@electric-sql/pglite";
import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { ObservationSource } from "@exposurenexus/contracts/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { PGliteDialect } from "kysely";
import { Migrator } from "kysely/migration";
import { pino } from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "./factory.js";
import { createMigrationProvider, migrateToLatest } from "./migration.js";

describe("migration runner", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports that an up-to-date database needs no migrations", async () => {
    vi.spyOn(Migrator.prototype, "migrateToLatest").mockResolvedValue({ results: [] });
    const logger = pino({ enabled: false });
    const info = vi.spyOn(logger, "info");
    await expect(migrateToLatest({} as never, logger)).resolves.toBeUndefined();
    expect(info).toHaveBeenCalledWith("no migrations to apply");
  });

  it("reports applied and failed migrations and propagates the original failure", async () => {
    const error = new Error("migration failed");
    vi.spyOn(Migrator.prototype, "migrateToLatest").mockResolvedValue({
      error,
      results: [
        { migrationName: "first", direction: "Up", status: "Success" },
        { migrationName: "second", direction: "Up", status: "Error" },
        { migrationName: "third", direction: "Up", status: "NotExecuted" },
      ],
    });
    const logger = pino({ enabled: false });
    const info = vi.spyOn(logger, "info");
    const logError = vi.spyOn(logger, "error");
    await expect(migrateToLatest({} as never, logger)).rejects.toBe(error);
    expect(info).toHaveBeenCalledWith('migration "first" applied successfully');
    expect(logError).toHaveBeenCalledWith('failed to apply migration "second"');
    expect(logError).toHaveBeenCalledWith(error);
    expect(info).not.toHaveBeenCalledWith('migration "third" applied successfully');
  });

  it("propagates startup failures when no migration results are available", async () => {
    const error = new Error("database unavailable");
    vi.spyOn(Migrator.prototype, "migrateToLatest").mockResolvedValue({ error });
    await expect(migrateToLatest({} as never, pino({ enabled: false }))).rejects.toBe(error);
  });
});

describe("database migration preservation", () => {
  it(
    "preserves ingestion and observation provenance without inventing or linking import sources",
    { timeout: 30_000 },
    async () => {
      const pgLite = new PGlite("memory://");
      await pgLite.waitReady;
      const database = createDatabase(new PGliteDialect({ pglite: pgLite }));

      try {
        const migrator = new Migrator({ db: database, provider: createMigrationProvider() });
        const migration = await migrator.migrateTo("20260913-import-sources");
        expect(migration.error).toBeUndefined();

        const actor = await database
          .insertInto("user_profile")
          .values({
            username: "migration-provenance",
            email: "migration-provenance@example.test",
            displayName: "Migration provenance",
            enabled: true,
            passwordHash: "unused",
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        const createdAt = new Date("2026-09-12T10:00:00.000Z");
        const audit = { createdAt, updatedAt: createdAt, createdBy: actor.id, updatedBy: actor.id };
        const ingestion = await database
          .insertInto("ingestion")
          .values({ source: "nuclei", createdAt, createdBy: actor.id })
          .returningAll()
          .executeTakeFirstOrThrow();
        const asset = await database
          .insertInto("asset")
          .values({
            displayName: "Existing host",
            type: AssetType.Host,
            environment: AssetEnvironment.Production,
            lifecycleState: AssetLifecycleState.Active,
            ...audit,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        const finding = await database
          .insertInto("finding")
          .values({
            assetId: asset.id,
            title: "Existing finding",
            severity: VulnerabilitySeverity.High,
            status: FindingStatus.Active,
            weakness: { identifiers: { nuclei: ["existing-template"] } },
            affectedResource: { type: AffectedResourceType.Unspecified },
            ...audit,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        const observation = await database
          .insertInto("observation")
          .values({
            findingId: finding.id,
            ingestionId: ingestion.id,
            source: ObservationSource.Nuclei,
            title: "Existing scanner observation",
            evidence: "Original scanner evidence",
            severity: VulnerabilitySeverity.High,
            weakness: finding.weakness,
            affectedResource: finding.affectedResource,
            observedAt: new Date("2026-09-12T09:00:00.000Z"),
            ...audit,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        const source = await database
          .insertInto("import_source")
          .values({
            id: "00000000-0000-4000-8000-000000000001",
            createdBy: actor.id,
            originalFilename: "unattached.jsonl",
            mimeType: "application/x-ndjson",
            bucket: "private-imports",
            objectKey: "import-sources/unattached",
            sizeBytes: 3,
            retentionPolicy: "keep",
            state: "available",
            cleanupRequired: false,
            createdAt,
            availableAt: createdAt,
            failedAt: null,
            deletedAt: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        await migrateToLatest(database, pino({ enabled: false }));

        expect(await database.selectFrom("ingestion").selectAll().execute()).toEqual([ingestion]);
        expect(await database.selectFrom("finding").selectAll().execute()).toEqual([finding]);
        expect(await database.selectFrom("observation").selectAll().execute()).toEqual([
          observation,
        ]);
        expect(await database.selectFrom("import_source").selectAll().execute()).toEqual([
          { ...source, ingestionId: null },
        ]);
      } finally {
        await database.destroy();
        if (!pgLite.closed) await pgLite.close();
      }
    },
  );
});

const expectedMigrationNames = [
  "20251219-init-better-auth",
  "20251220-assets",
  "20260118-vulnerability-mapping",
  "20260414-better-auth-admin",
  "20260418-rbac-role-default",
  "20260419-rbac-role-permissions",
  "20260422-custom-auth",
  "20260426-user-session-id-text",
  "20260427-user-role-assignment-primary-key",
  "20260428-drop-better-auth-tables",
  "20260429-asset-custom-fields",
  "20260430-01-rbac-custom-field-permissions",
  "20260430-02-rbac-custom-field-built-in-roles",
  "20260430-03-asset-custom-field-assignments",
  "20260503-asset-owner",
  "20260506-finding-assignee",
  "20260506-finding-due-date",
  "20260509-02-finding-vulnerability-delete-restrict",
  "20260509-03-finding-asset-delete-restrict",
  "20260509-vulnerability-source-mapping-unique",
  "20260510-audit-nullability-contract",
  "20260510-rbac-role-permission-role-id-camel-case",
  "20260511-asset-model-cutover",
  "20260512-asset-identifiers",
  "20260816-observation-model-cutover",
  "20260827-job-outbox",
  "20260913-import-sources",
  "20260913-import-sources-ingestion-link",
];

// Forward-only migration history prevents renaming this already-applied file set.
const legacyMixedMigrationDateExceptions = new Set(["20260509"]);

function migrationDate(migrationName: string): string {
  return migrationName.slice(0, 8);
}

function migrationNameStyle(migrationName: string): "numbered" | "unnumbered" {
  return /^\d{8}-\d{2}-/u.test(migrationName) ? "numbered" : "unnumbered";
}

describe("database migration provider", () => {
  it("loads runtime migrations from the migration directory by filename", async () => {
    const migrations = await createMigrationProvider().getMigrations();

    expect(Object.keys(migrations).sort()).toEqual(expectedMigrationNames);
    for (const name of expectedMigrationNames) {
      expect(typeof migrations[name]?.up).toBe("function");
    }
  });

  it("does not mix numbered and unnumbered migrations on the same date", async () => {
    const migrations = await createMigrationProvider().getMigrations();
    const migrationStylesByDate = new Map<string, Set<string>>();

    for (const migrationName of Object.keys(migrations)) {
      const date = migrationDate(migrationName);
      const styles = migrationStylesByDate.get(date) ?? new Set<string>();

      styles.add(migrationNameStyle(migrationName));
      migrationStylesByDate.set(date, styles);
    }

    const mixedDates = [...migrationStylesByDate.entries()]
      .filter(([date]) => !legacyMixedMigrationDateExceptions.has(date))
      .filter(([, styles]) => styles.size > 1)
      .map(([date]) => date);

    expect(mixedDates).toEqual([]);
  });
});
