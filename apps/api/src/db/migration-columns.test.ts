import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/types/model/rbac";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: {
    PORT: 3001,
    LOG_LEVEL: "info",
    APP_ORIGIN: "http://localhost:3000",
    AUTH_SESSION_LIFETIME: 12,
    AUTH_COOKIE_SECURE: true,
    AUTH_SECRET: "012345678901234567890123456789012345678901234567890123456789",
    DATABASE_URL: "postgres://exposurenexus:exposurenexus@localhost:5432/exposurenexus",
    API_TIMEOUT_MS: 5000,
  },
}));

const { createTestDatabase } = await import("../test/db.js");

describe("db migration columns", () => {
  const testDb = createTestDatabase();

  beforeAll(async () => {
    await testDb.start();
  });

  afterAll(async () => {
    await testDb.dispose();
  });

  it("drops legacy auth tables and points audit columns at user profiles", async () => {
    const legacyAuthTables = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('user', 'session', 'account', 'verification')
    `.execute(testDb.db);

    const userSessionColumns = await sql<{
      column_name: string;
      data_type: string;
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'user_session'
    `.execute(testDb.db);
    const auditColumns = await sql<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_name in ('vulnerability', 'finding')
        and column_name in ('createdBy', 'updatedBy')
      order by table_name asc, column_name asc
    `.execute(testDb.db);
    const auditForeignKeys = await sql<{
      constraint_name: string;
      source_table: string;
      target_table: string;
      delete_rule: string;
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where rc.constraint_name in (
        'vulnerability_createdBy_fkey',
        'vulnerability_updatedBy_fkey',
        'finding_createdBy_fkey',
        'finding_updatedBy_fkey'
      )
      order by constraint_name asc
    `.execute(testDb.db);

    expect(legacyAuthTables.rows).toEqual([]);
    expect(userSessionColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "sessionId",
          data_type: "text",
        }),
      ]),
    );
    expect(auditColumns.rows).toEqual(
      expect.arrayContaining([
        {
          table_name: "finding",
          column_name: "createdBy",
          data_type: "uuid",
        },
        {
          table_name: "finding",
          column_name: "updatedBy",
          data_type: "uuid",
        },
        {
          table_name: "vulnerability",
          column_name: "createdBy",
          data_type: "uuid",
        },
        {
          table_name: "vulnerability",
          column_name: "updatedBy",
          data_type: "uuid",
        },
      ]),
    );
    expect(auditForeignKeys.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constraint_name: "finding_createdBy_fkey",
          target_table: "user_profile",
          delete_rule: "RESTRICT",
        }),
        expect.objectContaining({
          constraint_name: "finding_updatedBy_fkey",
          target_table: "user_profile",
          delete_rule: "RESTRICT",
        }),
        expect.objectContaining({
          constraint_name: "vulnerability_createdBy_fkey",
          target_table: "user_profile",
          delete_rule: "RESTRICT",
        }),
        expect.objectContaining({
          constraint_name: "vulnerability_updatedBy_fkey",
          target_table: "user_profile",
          delete_rule: "RESTRICT",
        }),
      ]),
    );
  });

  it("enforces non-null columns exposed as required API fields", async () => {
    const requiredColumns = await sql<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>`
      select table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where (
          table_name = 'finding'
           and column_name in (
             'createdBy',
             'updatedBy',
             'title',
             'weakness',
             'affectedResource'
           )
        )
        or (
          table_name = 'vulnerability'
          and column_name in ('createdBy', 'updatedBy')
        )
        or (
          table_name = 'user_profile'
          and column_name = 'enabled'
        )
      order by table_name asc, column_name asc
    `.execute(testDb.db);

    expect(requiredColumns.rows).toEqual(
      expect.arrayContaining([
        {
          table_name: "finding",
          column_name: "createdBy",
          data_type: "uuid",
          is_nullable: "NO",
        },
        {
          table_name: "finding",
          column_name: "title",
          data_type: "text",
          is_nullable: "NO",
        },
        {
          table_name: "finding",
          column_name: "weakness",
          data_type: "jsonb",
          is_nullable: "NO",
        },
        {
          table_name: "finding",
          column_name: "affectedResource",
          data_type: "jsonb",
          is_nullable: "NO",
        },
        {
          table_name: "finding",
          column_name: "updatedBy",
          data_type: "uuid",
          is_nullable: "NO",
        },
        {
          table_name: "user_profile",
          column_name: "enabled",
          data_type: "boolean",
          is_nullable: "NO",
        },
        {
          table_name: "vulnerability",
          column_name: "createdBy",
          data_type: "uuid",
          is_nullable: "NO",
        },
        {
          table_name: "vulnerability",
          column_name: "updatedBy",
          data_type: "uuid",
          is_nullable: "NO",
        },
      ]),
    );
  });

  it("adds nullable asset owner identity pointing at user profiles", async () => {
    const assetOwnerColumns = await sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'asset'
        and column_name = 'ownerId'
    `.execute(testDb.db);
    const assetOwnerForeignKeys = await sql<{
      constraint_name: string;
      source_table: string;
      target_table: string;
      delete_rule: string;
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name = 'asset'
        and kcu.column_name = 'ownerId'
    `.execute(testDb.db);

    expect(assetOwnerColumns.rows).toEqual([
      {
        column_name: "ownerId",
        data_type: "uuid",
        is_nullable: "YES",
      },
    ]);
    expect(assetOwnerForeignKeys.rows).toEqual([
      expect.objectContaining({
        source_table: "asset",
        target_table: "user_profile",
        delete_rule: "SET NULL",
      }),
    ]);
  });

  it("creates the expanded asset core metadata and audit contract", async () => {
    const assetColumns = await sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'asset'
      order by column_name asc
    `.execute(testDb.db);
    const displayNameColumn = await sql<{ character_maximum_length: number | null }>`
      select character_maximum_length
      from information_schema.columns
      where table_name = 'asset' and column_name = 'displayName'
    `.execute(testDb.db);
    const assetTypes = await sql<{ typname: string; enumlabel: string }>`
      select pg_type.typname, pg_enum.enumlabel
      from pg_type
      join pg_enum on pg_enum.enumtypid = pg_type.oid
      where pg_type.typname in ('asset_type', 'asset_environment', 'asset_lifecycle_state')
      order by pg_type.typname asc, pg_enum.enumsortorder asc
    `.execute(testDb.db);
    const auditForeignKeys = await sql<{
      constraint_name: string;
      source_table: string;
      target_table: string;
      delete_rule: string;
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name = 'asset'
        and kcu.column_name in ('ownerId', 'createdBy', 'updatedBy')
      order by constraint_name asc
    `.execute(testDb.db);

    expect(assetColumns.rows).toEqual(
      expect.arrayContaining([
        {
          column_name: "displayName",
          data_type: "character varying",
          is_nullable: "NO",
        },
        {
          column_name: "type",
          data_type: "USER-DEFINED",
          is_nullable: "NO",
        },
        {
          column_name: "environment",
          data_type: "USER-DEFINED",
          is_nullable: "NO",
        },
        {
          column_name: "lifecycleState",
          data_type: "USER-DEFINED",
          is_nullable: "NO",
        },
        {
          column_name: "ownerId",
          data_type: "uuid",
          is_nullable: "YES",
        },
        {
          column_name: "createdAt",
          data_type: "timestamp with time zone",
          is_nullable: "NO",
        },
        {
          column_name: "updatedAt",
          data_type: "timestamp with time zone",
          is_nullable: "NO",
        },
        {
          column_name: "createdBy",
          data_type: "uuid",
          is_nullable: "NO",
        },
        {
          column_name: "updatedBy",
          data_type: "uuid",
          is_nullable: "NO",
        },
      ]),
    );
    expect(displayNameColumn.rows).toEqual([{ character_maximum_length: 255 }]);
    expect(assetColumns.rows.map((row) => row.column_name)).not.toContain("name");
    expect(assetTypes.rows).toEqual([
      { typname: "asset_environment", enumlabel: "development" },
      { typname: "asset_environment", enumlabel: "staging" },
      { typname: "asset_environment", enumlabel: "production" },
      { typname: "asset_environment", enumlabel: "unknown" },
      { typname: "asset_environment", enumlabel: "notApplicable" },
      { typname: "asset_lifecycle_state", enumlabel: "active" },
      { typname: "asset_lifecycle_state", enumlabel: "archived" },
      { typname: "asset_type", enumlabel: "host" },
      { typname: "asset_type", enumlabel: "software" },
      { typname: "asset_type", enumlabel: "containerImage" },
      { typname: "asset_type", enumlabel: "cloudResource" },
    ]);
    expect(auditForeignKeys.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_table: "asset",
          target_table: "user_profile",
          delete_rule: "SET NULL",
        }),
        expect.objectContaining({
          constraint_name: "asset_createdBy_fkey",
          source_table: "asset",
          target_table: "user_profile",
          delete_rule: "RESTRICT",
        }),
        expect.objectContaining({
          constraint_name: "asset_updatedBy_fkey",
          source_table: "asset",
          target_table: "user_profile",
          delete_rule: "RESTRICT",
        }),
      ]),
    );
  });

  it("creates the globally unique typed asset identifier contract", async () => {
    const identifierColumns = await sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      character_maximum_length: number | null;
    }>`
      select column_name, data_type, is_nullable, character_maximum_length
      from information_schema.columns
      where table_name = 'asset_identifier'
      order by ordinal_position asc
    `.execute(testDb.db);
    const identifierTypes = await sql<{ enumlabel: string }>`
      select pg_enum.enumlabel
      from pg_type
      join pg_enum on pg_enum.enumtypid = pg_type.oid
      where pg_type.typname = 'asset_identifier_type'
      order by pg_enum.enumsortorder asc
    `.execute(testDb.db);
    const indexes = await sql<{ indexname: string; indexdef: string }>`
      select indexname, indexdef
      from pg_indexes
      where tablename = 'asset_identifier'
        and indexname = 'asset_identifier_type_namespace_value_unique'
    `.execute(testDb.db);
    const foreignKeys = await sql<{ target_table: string; delete_rule: string }>`
      select ccu.table_name as target_table, rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name = 'asset_identifier'
        and kcu.column_name = 'assetId'
    `.execute(testDb.db);

    expect(identifierColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column_name: "id", data_type: "uuid", is_nullable: "NO" }),
        expect.objectContaining({
          column_name: "assetId",
          data_type: "uuid",
          is_nullable: "NO",
        }),
        expect.objectContaining({
          column_name: "type",
          data_type: "USER-DEFINED",
          is_nullable: "NO",
        }),
        expect.objectContaining({
          column_name: "namespace",
          data_type: "character varying",
          character_maximum_length: 255,
          is_nullable: "YES",
        }),
        expect.objectContaining({
          column_name: "value",
          data_type: "character varying",
          character_maximum_length: 2048,
          is_nullable: "NO",
        }),
      ]),
    );
    expect(identifierTypes.rows).toEqual([
      { enumlabel: "dnsName" },
      { enumlabel: "ipAddress" },
      { enumlabel: "vcsRepository" },
      { enumlabel: "ociImageName" },
      { enumlabel: "cloudResourceId" },
    ]);
    expect(indexes.rows).toEqual([
      expect.objectContaining({
        indexname: "asset_identifier_type_namespace_value_unique",
        indexdef: expect.stringContaining("UNIQUE"),
      }),
    ]);
    expect(foreignKeys.rows).toEqual([
      expect.objectContaining({ target_table: "asset", delete_rule: "CASCADE" }),
    ]);
  });

  it("adds nullable finding assignee identity pointing at user profiles", async () => {
    const findingAssigneeColumns = await sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'finding'
        and column_name = 'assigneeId'
    `.execute(testDb.db);
    const findingAssigneeForeignKeys = await sql<{
      constraint_name: string;
      source_table: string;
      target_table: string;
      delete_rule: string;
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name = 'finding'
        and kcu.column_name = 'assigneeId'
    `.execute(testDb.db);

    expect(findingAssigneeColumns.rows).toEqual([
      {
        column_name: "assigneeId",
        data_type: "uuid",
        is_nullable: "YES",
      },
    ]);
    expect(findingAssigneeForeignKeys.rows).toEqual([
      expect.objectContaining({
        source_table: "finding",
        target_table: "user_profile",
        delete_rule: "SET NULL",
      }),
    ]);
  });

  it("adds nullable finding due dates", async () => {
    const findingDueDateColumns = await sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_name = 'finding'
        and column_name = 'dueDate'
    `.execute(testDb.db);

    expect(findingDueDateColumns.rows).toEqual([
      {
        column_name: "dueDate",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      },
    ]);
  });

  it("creates normalized rbac tables with seeded built-in data", async () => {
    const roleColumns = await sql<{
      column_name: string;
      data_type: string;
      column_default: string | null;
    }>`
      select column_name, data_type, column_default
      from information_schema.columns
      where table_name = 'role'
    `.execute(testDb.db);

    const permissionAssignmentColumns = await sql<{
      column_name: string;
      data_type: string;
      udt_name: string;
    }>`
      select column_name, data_type, udt_name
      from information_schema.columns
      where table_name = 'role_permission_assignment'
    `.execute(testDb.db);

    const roleRows = await sql<{ id: string; name: string }>`
      select id, name
      from role
      order by name asc
    `.execute(testDb.db);

    const adminPermissions = await sql<{
      resource: string;
      verb: string;
    }>`
      select resource, verb
      from role_permission_assignment
      where "roleId" = ${builtInRoleIds.admin}
    `.execute(testDb.db);

    expect(roleColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "id",
          data_type: "uuid",
        }),
        expect.objectContaining({
          column_name: "name",
          data_type: "text",
        }),
      ]),
    );

    expect(permissionAssignmentColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "roleId",
          data_type: "uuid",
        }),
        expect.objectContaining({
          column_name: "resource",
          data_type: "USER-DEFINED",
          udt_name: "permission_resource",
        }),
        expect.objectContaining({
          column_name: "verb",
          data_type: "USER-DEFINED",
          udt_name: "permission_verb",
        }),
      ]),
    );
    expect(permissionAssignmentColumns.rows.map((row) => row.column_name)).not.toContain("role_id");

    const roleIdColumn = roleColumns.rows.find((row) => row.column_name === "id");

    expect(roleIdColumn?.column_default).toContain("gen_random_uuid()");
    expect(roleRows.rows).toEqual(
      expect.arrayContaining([
        { id: builtInRoleIds.admin, name: BuiltInRoleName.Admin },
        { id: builtInRoleIds.editor, name: BuiltInRoleName.Editor },
        { id: builtInRoleIds.viewer, name: BuiltInRoleName.Viewer },
      ]),
    );
    expect(adminPermissions.rows).toEqual(
      expect.arrayContaining([
        {
          resource: PermissionResource.User,
          verb: PermissionVerb.Write,
        },
        {
          resource: PermissionResource.Asset,
          verb: PermissionVerb.Delete,
        },
        {
          resource: PermissionResource.CustomField,
          verb: PermissionVerb.Delete,
        },
      ]),
    );
  });

  it("creates asset custom field tables with typed defaults and values", async () => {
    const customFieldColumns = await sql<{
      column_name: string;
      data_type: string;
      udt_name: string;
      column_default: string | null;
    }>`
      select column_name, data_type, udt_name, column_default
      from information_schema.columns
      where table_name = 'asset_custom_field'
    `.execute(testDb.db);

    const optionColumns = await sql<{
      column_name: string;
      data_type: string;
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'asset_custom_field_option'
    `.execute(testDb.db);

    const valueColumns = await sql<{
      column_name: string;
      data_type: string;
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'asset_custom_field_value'
    `.execute(testDb.db);
    const assignmentColumns = await sql<{
      column_name: string;
      data_type: string;
    }>`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'asset_custom_field_assignment'
    `.execute(testDb.db);

    expect(customFieldColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "id",
          data_type: "uuid",
        }),
        expect.objectContaining({
          column_name: "key",
          data_type: "text",
        }),
        expect.objectContaining({
          column_name: "type",
          data_type: "USER-DEFINED",
          udt_name: "asset_custom_field_type",
        }),
        expect.objectContaining({
          column_name: "required",
          data_type: "boolean",
        }),
        expect.objectContaining({
          column_name: "defaultValue",
          data_type: "jsonb",
        }),
      ]),
    );

    const customFieldIdColumn = customFieldColumns.rows.find((row) => row.column_name === "id");
    const customFieldRequiredColumn = customFieldColumns.rows.find(
      (row) => row.column_name === "required",
    );

    expect(customFieldIdColumn?.column_default).toContain("gen_random_uuid()");
    expect(customFieldRequiredColumn?.column_default).toBe("false");
    expect(optionColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "fieldId",
          data_type: "uuid",
        }),
        expect.objectContaining({
          column_name: "value",
          data_type: "text",
        }),
        expect.objectContaining({
          column_name: "label",
          data_type: "text",
        }),
      ]),
    );
    expect(valueColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "assetId",
          data_type: "uuid",
        }),
        expect.objectContaining({
          column_name: "fieldId",
          data_type: "uuid",
        }),
        expect.objectContaining({
          column_name: "value",
          data_type: "jsonb",
        }),
      ]),
    );
    expect(assignmentColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "assetId",
          data_type: "uuid",
        }),
        expect.objectContaining({
          column_name: "fieldId",
          data_type: "uuid",
        }),
      ]),
    );
  });

  it("cascades vulnerability links when a vulnerability is deleted", async () => {
    const findingVulnerabilityForeignKeys = await sql<{
      constraint_name: string;
      source_table: string;
      target_table: string;
      delete_rule: string;
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name = 'finding_vulnerability'
        and kcu.column_name = 'vulnerabilityId'
    `.execute(testDb.db);

    expect(findingVulnerabilityForeignKeys.rows).toEqual([
      expect.objectContaining({
        constraint_name: "finding_vulnerability_vulnerabilityId_fkey",
        source_table: "finding_vulnerability",
        target_table: "vulnerability",
        delete_rule: "CASCADE",
      }),
    ]);
  });

  it("blocks asset deletion while findings reference it", async () => {
    const findingAssetForeignKeys = await sql<{
      constraint_name: string;
      source_table: string;
      target_table: string;
      delete_rule: string;
    }>`
      select
        rc.constraint_name,
        kcu.table_name as source_table,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name = 'finding'
        and kcu.column_name = 'assetId'
    `.execute(testDb.db);

    expect(findingAssetForeignKeys.rows).toEqual([
      expect.objectContaining({
        constraint_name: "finding_assetId_fkey",
        source_table: "finding",
        target_table: "asset",
        delete_rule: "RESTRICT",
      }),
    ]);
  });

  it("creates the final observation, ingestion, and catalog contracts", async () => {
    const columns = await sql<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
    }>`
      select table_name, column_name, data_type, udt_name, is_nullable
      from information_schema.columns
      where table_name in (
        'finding',
        'observation',
        'ingestion',
        'vulnerability',
        'finding_vulnerability',
        'vulnerability_source_mapping'
      )
      order by table_name asc, ordinal_position asc
    `.execute(testDb.db);

    expect(columns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table_name: "observation",
          column_name: "findingId",
          data_type: "uuid",
          is_nullable: "NO",
        }),
        expect.objectContaining({
          table_name: "observation",
          column_name: "ingestionId",
          data_type: "uuid",
          is_nullable: "YES",
        }),
        expect.objectContaining({
          table_name: "observation",
          column_name: "affectedResource",
          data_type: "jsonb",
          is_nullable: "NO",
        }),
        expect.objectContaining({
          table_name: "ingestion",
          column_name: "source",
          data_type: "USER-DEFINED",
          udt_name: "ingestion_source",
          is_nullable: "NO",
        }),
        expect.objectContaining({
          table_name: "vulnerability",
          column_name: "type",
          data_type: "USER-DEFINED",
          udt_name: "vulnerability_type",
          is_nullable: "NO",
        }),
        expect.objectContaining({
          table_name: "vulnerability",
          column_name: "identifier",
          data_type: "character varying",
          is_nullable: "NO",
        }),
        expect.objectContaining({
          table_name: "vulnerability",
          column_name: "metadata",
          data_type: "jsonb",
          is_nullable: "YES",
        }),
      ]),
    );

    expect(
      columns.rows
        .filter((column) => column.table_name === "ingestion")
        .map((column) => column.column_name),
    ).toEqual(["id", "source", "createdAt", "createdBy"]);
    expect(
      columns.rows.some((column) => column.table_name === "vulnerability_source_mapping"),
    ).toBe(false);

    for (const legacyColumn of [
      "vulnerabilityId",
      "source",
      "evidence",
      "firstSeen",
      "lastSeen",
      "fingerprint",
    ]) {
      expect(
        columns.rows.some(
          (column) => column.table_name === "finding" && column.column_name === legacyColumn,
        ),
      ).toBe(false);
    }
    expect(columns.rows.map((column) => column.table_name)).toEqual(
      expect.arrayContaining(["finding_vulnerability", "observation", "ingestion"]),
    );
  });

  it("uses closed catalog and source enums with no manual ingestion source", async () => {
    const enumValues = await sql<{ typname: string; enumlabel: string }>`
      select pg_type.typname, pg_enum.enumlabel
      from pg_type
      join pg_enum on pg_enum.enumtypid = pg_type.oid
      where pg_type.typname in ('vulnerability_type', 'observation_source', 'ingestion_source')
      order by pg_type.typname asc, pg_enum.enumsortorder asc
    `.execute(testDb.db);

    expect(enumValues.rows).toEqual([
      { typname: "ingestion_source", enumlabel: "nuclei" },
      { typname: "observation_source", enumlabel: "manual" },
      { typname: "observation_source", enumlabel: "nuclei" },
      { typname: "vulnerability_type", enumlabel: "cve" },
      { typname: "vulnerability_type", enumlabel: "cwe" },
      { typname: "vulnerability_type", enumlabel: "ghsa" },
      { typname: "vulnerability_type", enumlabel: "advisory" },
      { typname: "vulnerability_type", enumlabel: "custom" },
    ]);
  });

  it("couples observation source to ingestion identity", async () => {
    const constraints = await sql<{ definition: string }>`
      select pg_get_constraintdef(pg_constraint.oid) as definition
      from pg_constraint
      join pg_class on pg_class.oid = pg_constraint.conrelid
      where pg_class.relname = 'observation'
        and pg_constraint.conname = 'observation_source_ingestion_check'
    `.execute(testDb.db);

    expect(constraints.rows).toEqual([
      {
        definition: expect.stringContaining(
          "((source = 'manual'::observation_source) AND (\"ingestionId\" IS NULL))",
        ),
      },
    ]);
    expect(constraints.rows[0]?.definition).toContain(
      "((source <> 'manual'::observation_source) AND (\"ingestionId\" IS NOT NULL))",
    );
  });

  it("cascades child records and restricts ingestion deletion while observations remain", async () => {
    const foreignKeys = await sql<{
      source_table: string;
      source_column: string;
      target_table: string;
      delete_rule: string;
    }>`
      select
        kcu.table_name as source_table,
        kcu.column_name as source_column,
        ccu.table_name as target_table,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog = rc.constraint_catalog
        and kcu.constraint_schema = rc.constraint_schema
        and kcu.constraint_name = rc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog = rc.unique_constraint_catalog
        and ccu.constraint_schema = rc.unique_constraint_schema
        and ccu.constraint_name = rc.unique_constraint_name
      where kcu.table_name in ('observation', 'finding_vulnerability', 'vulnerability_source_mapping')
      order by source_table asc, source_column asc
    `.execute(testDb.db);

    expect(foreignKeys.rows).toEqual(
      expect.arrayContaining([
        {
          source_table: "finding_vulnerability",
          source_column: "findingId",
          target_table: "finding",
          delete_rule: "CASCADE",
        },
        {
          source_table: "observation",
          source_column: "findingId",
          target_table: "finding",
          delete_rule: "CASCADE",
        },
        {
          source_table: "observation",
          source_column: "ingestionId",
          target_table: "ingestion",
          delete_rule: "RESTRICT",
        },
      ]),
    );
    expect(
      foreignKeys.rows.some((row) => row.source_table === "vulnerability_source_mapping"),
    ).toBe(false);
  });
});
