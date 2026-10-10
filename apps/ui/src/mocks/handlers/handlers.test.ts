import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it } from "vitest";

import {
  createAsset,
  deleteAsset,
  getAssetByID,
  listAssetCustomFieldValues,
  listAssets,
  listAssetsWithCustomFields,
  listAvailableAssetCustomFieldDefinitions,
  updateAssetCustomFieldValues,
} from "@/features/assets/api/assets.ts";
import { getSession, signIn, signOut } from "@/features/auth/api/auth.ts";
import {
  createAssetCustomFieldDefinition,
  listAssetCustomFieldDefinitions,
  updateAssetCustomFieldDefinition,
} from "@/features/custom-fields/api/definitions.ts";
import {
  createManualFinding,
  getFindingByID,
  getFindingStats,
  linkFindingVulnerability,
  listFindingObservations,
  moveFindingObservation,
} from "@/features/findings/api/findings.ts";
import {
  createRole,
  deleteRole,
  getRoleByID,
  listRoles,
  updateRole,
} from "@/features/roles/api/roles.ts";
import { createUser, listUsers } from "@/features/users/api/users.ts";
import { deleteVulnerability } from "@/features/vulnerabilities/api/vulnerabilities.ts";
import { APIError } from "@/lib/api-client.ts";
import { toFindingRecord } from "@/mocks/db.ts";
import {
  CUSTOM_AUDITOR_ROLE,
  SEED_ASSETS,
  SEED_ASSETS_WITH_CUSTOM_FIELDS,
  SEED_CUSTOM_FIELDS,
  SEED_FINDINGS,
  SEED_OBSERVATIONS,
  SEED_ROLES,
  SEED_USERS,
  SEED_VULNERABILITIES,
  buildAsset,
  buildAuthSession,
  buildFinding,
  buildRole,
} from "@/mocks/fixtures/index.ts";
import { db, mockApiError, seedScenario } from "@/test/msw.ts";

import type { CreateManualFinding } from "@exposurenexus/contracts/model/finding";

// Drives the real UI API clients against the mock handlers, so their response parsing proves
// the handlers speak the API's envelope and shapes.

describe("auth", () => {
  it("starts signed in as the seeded admin and can sign out and back in", async () => {
    expect((await getSession()).data.user).toEqual(SEED_USERS[0]);

    await signOut();
    await expect(getSession()).rejects.toMatchObject({ statusCode: 401 });
    await expect(listRoles()).rejects.toMatchObject({ statusCode: 401 });

    const { data } = await signIn.username({ username: "morgan", password: "anything" });
    expect(data.user).toEqual(SEED_USERS[1]);
  });

  it("rejects resource requests in the loggedOut scenario", async () => {
    seedScenario("loggedOut");
    await expect(listRoles()).rejects.toBeInstanceOf(APIError);
  });
});

describe("resources", () => {
  it("persists writes for later reads and validates request bodies", async () => {
    const role = await createRole({ name: "triager", permissions: [] });

    expect(await listRoles()).toEqual([...SEED_ROLES, role]);
    expect(await getRoleByID(role.id)).toEqual(role);
    await expect(createRole({ name: "not a valid name", permissions: [] })).rejects.toMatchObject({
      statusCode: 400,
      message: "Bad Request",
      reason: expect.stringContaining('"name"'),
    });
  });

  it("answers 404 for unknown ids", async () => {
    const id = "70000000-0000-4000-8000-0000000000ff";
    await expect(getRoleByID(id)).rejects.toMatchObject({
      statusCode: 404,
      message: `role with id ${id} does not exist`,
    });
  });

  it("serves custom-field definitions without colliding with asset ids", async () => {
    expect(await listAssetCustomFieldDefinitions()).toEqual(SEED_CUSTOM_FIELDS);
    const field = await createAssetCustomFieldDefinition({
      key: "team",
      name: "Team",
      required: false,
      type: AssetCustomFieldType.Text,
    });
    expect(field).toMatchObject({ key: "team", defaultValue: null });
    expect(await getAssetByID(SEED_ASSETS[0].id)).toEqual(SEED_ASSETS[0]);
  });

  it("filters assets like the API", async () => {
    // Case-insensitive substring of the display name or an identifier value.
    expect(await listAssets({ filter: "WEB-01.example" })).toEqual([SEED_ASSETS[0]]);
    expect(await listAssets({ assetOwnerId: ["none"] })).toEqual([SEED_ASSETS[1]]);
    expect(await listAssetsWithCustomFields()).toEqual(SEED_ASSETS_WITH_CUSTOM_FIELDS);
  });

  it("derives finding statistics and observation fields", async () => {
    const stats = await getFindingStats();
    expect(stats.total).toBe(SEED_FINDINGS.length);
    expect(stats.status[FindingStatus.Active]).toBe(2);
    expect(stats.severity[VulnerabilitySeverity.Critical]).toBe(1);

    const created = await createManualFinding({
      assetId: SEED_ASSETS[2].id,
      title: "Hard-coded secret",
      severity: VulnerabilitySeverity.High,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: { identifiers: {} },
      affectedResource: SEED_FINDINGS[1].affectedResource,
      vulnerabilityIds: [],
      observation: {},
    });
    expect(created.observationCount).toBe(1);

    const linked = await linkFindingVulnerability(created.id, SEED_VULNERABILITIES[1].id);
    expect(linked.vulnerabilities).toEqual([SEED_VULNERABILITIES[1]]);

    await moveFindingObservation(SEED_FINDINGS[1].id, SEED_OBSERVATIONS[2].id, created.id);
    expect((await getFindingByID(created.id)).observationCount).toBe(2);
    expect((await getFindingByID(SEED_FINDINGS[1].id)).observationCount).toBe(0);
  });
});

// Each case pins down a behavior checked against apps/api and packages/backend.
describe("API semantics", () => {
  const [WEB_01, , API_WORKER] = SEED_ASSETS;
  const [CATEGORY, PRIORITY, TIER] = SEED_CUSTOM_FIELDS;
  const [ROBIN, MORGAN, CASEY] = SEED_USERS;

  it("creates assets in the unknown environment, active, with no custom fields", async () => {
    const asset = await createAsset({ displayName: " db-01 ", type: AssetType.Host });

    expect(asset).toMatchObject({
      displayName: "db-01",
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
    });
    expect(await listAssetCustomFieldValues(asset.id)).toEqual([]);
  });

  it("refuses to delete an asset that findings reference, and deletes it otherwise", async () => {
    await expect(deleteAsset(WEB_01.id)).rejects.toMatchObject({
      statusCode: 409,
      message: `asset ${WEB_01.id} is still referenced by findings`,
    });

    const asset = buildAsset();
    db.assets.insert(asset);
    db.customFieldAssignments.set(asset.id, new Map([[CATEGORY.id, "spare"]]));
    expect(await deleteAsset(asset.id)).toEqual(asset);
    expect(db.customFieldAssignments.has(asset.id)).toBe(false);
  });

  it("replaces all custom-field values, where null restores the definition default", async () => {
    const values = await updateAssetCustomFieldValues(WEB_01.id, [
      { fieldId: CATEGORY.id, value: null },
      { fieldId: PRIORITY.id, value: 5 },
      { fieldId: TIER.id, value: null },
    ]);

    expect(values.map(({ fieldId, source, value }) => ({ fieldId, source, value }))).toEqual([
      { fieldId: CATEGORY.id, source: AssetCustomFieldValueSource.Empty, value: null },
      { fieldId: PRIORITY.id, source: AssetCustomFieldValueSource.Asset, value: 5 },
      { fieldId: TIER.id, source: AssetCustomFieldValueSource.Default, value: "production" },
    ]);
    await expect(
      updateAssetCustomFieldValues(WEB_01.id, [{ fieldId: PRIORITY.id, value: 5 }]),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "asset custom field value replacement is incomplete",
    });
  });

  it("requires a default for required fields and assigns new fields to no asset", async () => {
    const input = {
      key: "owner_team",
      name: "Owner team",
      required: true,
      type: AssetCustomFieldType.Text,
    } as const;

    await expect(createAssetCustomFieldDefinition(input)).rejects.toMatchObject({
      statusCode: 400,
      reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
    });
    const field = await createAssetCustomFieldDefinition({ ...input, defaultValue: "platform" });
    expect(await listAssetCustomFieldValues(WEB_01.id)).toEqual(
      SEED_ASSETS_WITH_CUSTOM_FIELDS[0].customFields,
    );
    expect(await listAvailableAssetCustomFieldDefinitions(WEB_01.id)).toEqual([field]);
  });

  it("gives every select option a new id when a definition is saved", async () => {
    if (TIER.type !== AssetCustomFieldType.Select) {
      throw new Error("expected the seeded select field");
    }
    const { id: _, options, ...definition } = TIER;
    const updated = await updateAssetCustomFieldDefinition(TIER.id, {
      ...definition,
      options: options.map(({ value, label }) => ({ value, label })),
    });

    if (updated.type !== AssetCustomFieldType.Select) {
      throw new Error("expected a select field");
    }
    expect(updated.options.map((option) => option.value)).toEqual(["production", "staging"]);
    for (const option of updated.options) {
      expect(TIER.options.map(({ id }) => id)).not.toContain(option.id);
    }
  });

  it("answers 409 for duplicate role names, custom-field keys, usernames and emails", async () => {
    await expect(
      createRole({ name: CUSTOM_AUDITOR_ROLE.name, permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 409, message: "role already exists" });
    await expect(
      createAssetCustomFieldDefinition({
        key: ` ${CATEGORY.key}`,
        name: "Another category",
        required: false,
        type: AssetCustomFieldType.Text,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "asset custom field definition already exists",
    });
    const { id: _, ...profile } = CASEY;
    for (const user of [
      { ...profile, email: "new@example.com" },
      { ...profile, username: "new" },
    ]) {
      await expect(createUser({ ...user, password: "secret" })).rejects.toMatchObject({
        statusCode: 409,
        message: "user profile already exists",
      });
    }
  });

  it("refuses to delete a role assigned to users or to change a built-in role", async () => {
    await expect(deleteRole(CUSTOM_AUDITOR_ROLE.id)).rejects.toMatchObject({
      statusCode: 409,
      message: `role ${CUSTOM_AUDITOR_ROLE.name} is still assigned to users`,
    });
    expect(db.users.get(MORGAN.id)?.roleIds).toContain(CUSTOM_AUDITOR_ROLE.id);
    await expect(deleteRole(builtInRoleIds.viewer)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      updateRole(builtInRoleIds.viewer, { name: "readers", permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403, message: "built-in roles cannot be modified" });

    const unassigned = buildRole();
    db.roles.insert(unassigned);
    expect(await deleteRole(unassigned.id)).toEqual(unassigned);
  });

  it("unlinks a deleted vulnerability from its findings", async () => {
    const [finding] = SEED_FINDINGS;
    const [vulnerability] = finding.vulnerabilities;

    await deleteVulnerability(vulnerability.id);

    expect(await getFindingByID(finding.id)).toMatchObject({ vulnerabilities: [] });
  });

  it("starts a manual finding with an observation that copies the finding", async () => {
    const input: CreateManualFinding = {
      assetId: API_WORKER.id,
      title: "Debug endpoint enabled",
      severity: VulnerabilitySeverity.Medium,
      status: FindingStatus.Active,
      assigneeId: null,
      dueDate: null,
      mitigation: null,
      weakness: SEED_FINDINGS[1].weakness,
      affectedResource: SEED_FINDINGS[1].affectedResource,
      vulnerabilityIds: [],
    };

    const finding = await createManualFinding(input);

    expect(finding.observationCount).toBe(1);
    expect(await listFindingObservations(finding.id)).toEqual([
      expect.objectContaining({
        title: input.title,
        severity: input.severity,
        weakness: input.weakness,
        affectedResource: input.affectedResource,
      }),
    ]);
    await expect(
      createManualFinding({ ...input, assetId: "70000000-0000-4000-8000-0000000000ff" }),
    ).rejects.toMatchObject({ statusCode: 400, message: "finding asset does not exist" });
  });

  it("enforces the signed-in user's role permissions", async () => {
    db.session = buildAuthSession(CASEY);
    await expect(listRoles()).rejects.toMatchObject({ statusCode: 403, message: "Forbidden" });

    // Morgan's auditor role may read users; neither role may write them.
    db.session = buildAuthSession(MORGAN);
    expect(await listUsers()).toEqual(SEED_USERS);
    await expect(createRole({ name: "triager", permissions: [] })).rejects.toMatchObject({
      statusCode: 403,
    });

    // Permissions follow the stored roles, like the API's per-request check.
    db.users.update(MORGAN.id, { roleIds: ROBIN.roleIds });
    expect(await createRole({ name: "triager", permissions: [] })).toMatchObject({
      name: "triager",
    });
  });
});

describe("test helpers", () => {
  it("serve records inserted into the db", async () => {
    const finding = buildFinding({ assetId: SEED_ASSETS[0].id });
    db.findings.insert(toFindingRecord(finding));

    expect(await getFindingByID(finding.id)).toEqual(finding);
  });

  it("override one endpoint with an error", async () => {
    mockApiError("get", "/roles", 503, "Service Unavailable");
    await expect(listRoles()).rejects.toMatchObject({
      statusCode: 503,
      message: "Service Unavailable",
    });
  });

  it("start every test from the default seed", async () => {
    expect(await listRoles()).toEqual(SEED_ROLES);
  });
});
