import { describe, expect, it } from "vitest"
import { createMigrationProvider } from "./migration.js"

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
  "20260509-vulnerability-source-mapping-unique"
]

describe("database migration provider", () => {
  it("loads runtime migrations from the migration directory by filename", async () => {
    const migrations = await createMigrationProvider().getMigrations()

    expect(Object.keys(migrations).sort()).toEqual(expectedMigrationNames)
    for (const name of expectedMigrationNames) {
      expect(migrations[name]?.up).toEqual(expect.any(Function))
    }
  })
})
