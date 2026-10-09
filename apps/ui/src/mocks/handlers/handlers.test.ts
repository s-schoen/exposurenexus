import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it } from "vitest";

import {
  listAssets,
  listAssetsWithCustomFields,
  getAssetByID,
} from "@/features/assets/api/assets.ts";
import { getSession, signIn, signOut } from "@/features/auth/api/auth.ts";
import {
  createAssetCustomFieldDefinition,
  listAssetCustomFieldDefinitions,
} from "@/features/custom-fields/api/definitions.ts";
import {
  createManualFinding,
  getFindingByID,
  getFindingStats,
  linkFindingVulnerability,
  moveFindingObservation,
} from "@/features/findings/api/findings.ts";
import { createRole, getRoleByID, listRoles } from "@/features/roles/api/roles.ts";
import { APIError } from "@/lib/api-client.ts";
import { toFindingRecord } from "@/mocks/db.ts";
import {
  SEED_ASSETS,
  SEED_ASSETS_WITH_CUSTOM_FIELDS,
  SEED_CUSTOM_FIELDS,
  SEED_FINDINGS,
  SEED_OBSERVATIONS,
  SEED_ROLES,
  SEED_USERS,
  SEED_VULNERABILITIES,
  buildFinding,
} from "@/mocks/fixtures/index.ts";
import { db, mockApiError, seedScenario } from "@/test/msw.ts";

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
    });
  });

  it("answers 404 for unknown ids", async () => {
    await expect(getRoleByID("70000000-0000-4000-8000-0000000000ff")).rejects.toMatchObject({
      statusCode: 404,
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
