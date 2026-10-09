import { authSessionDataReplySchema } from "@exposurenexus/contracts/api";
import { assetSchema, assetWithCustomFieldsSchema } from "@exposurenexus/contracts/model/asset";
import {
  AssetCustomFieldType,
  assetCustomFieldDefinitionSchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { findingSchema } from "@exposurenexus/contracts/model/finding";
import { ObservationSource, observationSchema } from "@exposurenexus/contracts/model/observation";
import { roleSchema } from "@exposurenexus/contracts/model/rbac";
import { userProfileSchema } from "@exposurenexus/contracts/model/user";
import { vulnerabilityCatalogSchema } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it } from "vitest";

import {
  createMockDb,
  listAssetCustomFieldValues,
  projectFinding,
  toFindingRecord,
} from "@/mocks/db.ts";
import {
  SEED_ASSETS,
  SEED_ASSETS_WITH_CUSTOM_FIELDS,
  SEED_AUTH_SESSION,
  SEED_CUSTOM_FIELDS,
  SEED_FINDINGS,
  SEED_OBSERVATIONS,
  SEED_ROLES,
  SEED_USERS,
  SEED_VULNERABILITIES,
  USER_FORM_ROLE_FIXTURES,
  buildAsset,
  buildAssetIdentifier,
  buildAssetWithCustomFields,
  buildAuthSession,
  buildCustomFieldDefinition,
  buildCustomFieldOption,
  buildFinding,
  buildObservation,
  buildRole,
  buildUser,
  buildVulnerability,
} from "@/mocks/fixtures/index.ts";

import type { z } from "zod/v4";

// The UI parses every API response with these strict schemas, so drifting fixtures would
// break mocked pages in confusing ways. Fail here instead.
function schemaIssues(schema: z.ZodType, values: Array<unknown>) {
  return values.flatMap((value) => schema.safeParse(value).error?.issues ?? []);
}

describe("fixture builders", () => {
  it("build contract-valid records", () => {
    const fieldId = buildCustomFieldDefinition().id;

    expect(schemaIssues(userProfileSchema, [buildUser()])).toEqual([]);
    expect(schemaIssues(roleSchema, [buildRole()])).toEqual([]);
    expect(schemaIssues(authSessionDataReplySchema, [buildAuthSession(buildUser())])).toEqual([]);
    expect(schemaIssues(vulnerabilityCatalogSchema, [buildVulnerability()])).toEqual([]);
    expect(
      schemaIssues(assetSchema, [buildAsset({ identifiers: [buildAssetIdentifier()] })]),
    ).toEqual([]);
    expect(schemaIssues(assetWithCustomFieldsSchema, [buildAssetWithCustomFields()])).toEqual([]);
    expect(
      schemaIssues(assetCustomFieldDefinitionSchema, [
        buildCustomFieldDefinition(),
        buildCustomFieldDefinition({ type: AssetCustomFieldType.Number, defaultValue: 3 }),
        buildCustomFieldDefinition({
          id: fieldId,
          type: AssetCustomFieldType.Select,
          defaultValue: null,
          options: [buildCustomFieldOption(fieldId)],
        }),
      ]),
    ).toEqual([]);
    expect(
      schemaIssues(findingSchema, [buildFinding({ vulnerabilities: [buildVulnerability()] })]),
    ).toEqual([]);
    expect(
      schemaIssues(observationSchema, [
        buildObservation(),
        buildObservation({
          source: ObservationSource.Nuclei,
          ingestionId: "9ebad20b-2842-4738-99e5-67df7fcfc079",
        }),
      ]),
    ).toEqual([]);
  });

  it("number records per kind deterministically", () => {
    expect(buildFinding()).toMatchObject({
      id: "50000000-0000-4000-8000-000000000001",
      title: "Finding 1",
    });
    expect(buildFinding().title).toBe("Finding 2");
    expect(buildAsset().id).toBe("10000000-0000-4000-8000-000000000001");
  });

  it("restart numbering after each test", () => {
    expect(buildFinding().title).toBe("Finding 1");
  });

  it("let overrides win", () => {
    expect(buildFinding({ title: "SQL injection" }).title).toBe("SQL injection");
  });
});

describe("seed data", () => {
  it("is contract-valid", () => {
    expect(schemaIssues(roleSchema, [...SEED_ROLES, ...USER_FORM_ROLE_FIXTURES])).toEqual([]);
    expect(schemaIssues(userProfileSchema, SEED_USERS)).toEqual([]);
    expect(schemaIssues(authSessionDataReplySchema, [SEED_AUTH_SESSION])).toEqual([]);
    expect(schemaIssues(vulnerabilityCatalogSchema, SEED_VULNERABILITIES)).toEqual([]);
    expect(schemaIssues(assetSchema, SEED_ASSETS)).toEqual([]);
    expect(schemaIssues(assetWithCustomFieldsSchema, SEED_ASSETS_WITH_CUSTOM_FIELDS)).toEqual([]);
    expect(schemaIssues(assetCustomFieldDefinitionSchema, SEED_CUSTOM_FIELDS)).toEqual([]);
    expect(schemaIssues(findingSchema, SEED_FINDINGS)).toEqual([]);
    expect(schemaIssues(observationSchema, SEED_OBSERVATIONS)).toEqual([]);
  });

  it("matches what the mock API derives from it", () => {
    const db = createMockDb();

    expect(SEED_FINDINGS.map((finding) => projectFinding(db, toFindingRecord(finding)))).toEqual(
      SEED_FINDINGS,
    );
    for (const asset of SEED_ASSETS_WITH_CUSTOM_FIELDS) {
      expect(listAssetCustomFieldValues(db, asset.id)).toEqual(asset.customFields);
    }
  });
});
