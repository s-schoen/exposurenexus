import { Migrator } from "kysely/migration";
import { pino } from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

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
