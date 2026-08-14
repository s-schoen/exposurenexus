import { AssetCustomFieldRuleViolationReason } from "@exposurenexus/types/model/asset-custom-field";
import { describe, expect, expectTypeOf, it } from "vitest";

import { ApplicationError, type ApplicationErrorInput } from "./application-error.js";

function assertApplicationErrorInputTypes() {
  const validInput = {
    code: "role.unknown_ids",
    kind: "validation",
    message: "unknown role ids: viewer",
    details: { roleIds: ["viewer"] },
  } satisfies ApplicationErrorInput;

  expectTypeOf(validInput.kind).toEqualTypeOf<"validation">();

  // @ts-expect-error role.unknown_ids is pinned to validation.
  const wrongKind: ApplicationErrorInput = {
    code: "role.unknown_ids",
    kind: "conflict",
    message: "unknown role ids: viewer",
    details: { roleIds: ["viewer"] },
  };
  void wrongKind;

  // @ts-expect-error role.get_failed requires roleId details.
  const missingDetails: ApplicationErrorInput = {
    code: "role.get_failed",
    kind: "unexpected",
    message: "failed to get role",
  };
  void missingDetails;

  const unexpectedDetails: ApplicationErrorInput = {
    code: "role.list_failed",
    kind: "unexpected",
    message: "failed to list roles",
    // @ts-expect-error role.list_failed does not carry structured details.
    details: {},
  };
  void unexpectedDetails;

  const assetRuleViolationInput = {
    code: "asset_custom_field.definition.rule_violation",
    kind: "validation",
    message: "required asset custom fields must define a default value",
    details: {
      reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
      path: ["defaultValue"],
    },
  } satisfies ApplicationErrorInput;

  expectTypeOf(
    assetRuleViolationInput.details.reason,
  ).toEqualTypeOf<AssetCustomFieldRuleViolationReason.RequiredDefaultMissing>();

  const findingNotFoundInput = {
    code: "finding.reclassification_target_vulnerability_missing",
    kind: "missing",
    message: "target vulnerability does not exist",
    details: { vulnerabilityId: "missing-vulnerability-id" },
  } satisfies ApplicationErrorInput;

  expectTypeOf(findingNotFoundInput.kind).toEqualTypeOf<"missing">();

  const vulnerabilityMappingConflictInput = {
    code: "vulnerability.mapping.create_conflict",
    kind: "conflict",
    message: "vulnerability source mapping already exists",
    details: {
      vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      source: "nuclei",
      matchQuery: '{"templateID":"admin-panel"}',
    },
  } satisfies ApplicationErrorInput;

  expectTypeOf(vulnerabilityMappingConflictInput.kind).toEqualTypeOf<"conflict">();

  const vulnerabilityMappingTargetMissingInput = {
    code: "vulnerability.mapping_target_missing",
    kind: "missing",
    message: "target vulnerability does not exist",
    details: { vulnerabilityId: "missing-vulnerability-id" },
  } satisfies ApplicationErrorInput;

  expectTypeOf(vulnerabilityMappingTargetMissingInput.kind).toEqualTypeOf<"missing">();

  const statsInput = {
    code: "stats.get_finding_stats_failed",
    kind: "unexpected",
    message: "failed to retrieve statistics",
  } satisfies ApplicationErrorInput;

  expectTypeOf(statsInput.kind).toEqualTypeOf<"unexpected">();

  const wrongConstructorKind = new ApplicationError<"role.unknown_ids">({
    code: "role.unknown_ids",
    // @ts-expect-error constructor input kind is pinned by code.
    kind: "conflict",
    message: "unknown role ids: viewer",
    details: { roleIds: ["viewer"] },
  });
  void wrongConstructorKind;
}

describe("application errors", () => {
  it("stores typed object input as runtime error fields", () => {
    const cause = new Error("db offline");
    const error = new ApplicationError({
      code: "role.unknown_ids",
      kind: "validation",
      message: "unknown role ids: viewer",
      cause,
      details: { roleIds: ["viewer"] },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "ApplicationError",
      code: "role.unknown_ids",
      kind: "validation",
      details: { roleIds: ["viewer"] },
    });
    expect(error.cause).toBe(cause);
  });

  it("supports no-detail error inputs", () => {
    const error = new ApplicationError({
      code: "role.list_failed",
      kind: "unexpected",
      message: "failed to list roles",
    });

    expect(error).toMatchObject({
      code: "role.list_failed",
      kind: "unexpected",
      details: undefined,
    });
  });

  it("keeps compile-time input constraints", () => {
    expect(assertApplicationErrorInputTypes).toBeTypeOf("function");
  });
});
