import {
  AssetIdentifierType,
  AssetIdentifierValidationReason,
} from "@exposurenexus/contracts/model/asset-identifier";
import { describe, expect, it } from "vitest";

import { cloudResourceIdValueSchema, validateAssetIdentifier } from "./schema.js";

function validationResult(value: string) {
  return validateAssetIdentifier({
    type: AssetIdentifierType.CloudResourceId,
    value,
  });
}

describe("cloud resource ID value schema", () => {
  it("trims surrounding whitespace while preserving case and syntax", () => {
    expect(cloudResourceIdValueSchema.parse("  Arn:AWS:EC2:Example/Resource  ")).toBe(
      "Arn:AWS:EC2:Example/Resource",
    );
    expect(cloudResourceIdValueSchema.parse("arn:aws:ec2:resource with spaces")).toBe(
      "arn:aws:ec2:resource with spaces",
    );
  });

  it("normalizes the same value idempotently", () => {
    const normalized = cloudResourceIdValueSchema.parse("  Resource/Case  ");

    expect(cloudResourceIdValueSchema.parse(normalized)).toBe(normalized);
  });

  it.each(["", "   ", "\t\n"])("rejects empty value %j", (value) => {
    expect(validationResult(value)).toEqual({
      success: false,
      issues: [
        {
          path: ["value"],
          reason: AssetIdentifierValidationReason.Empty,
          detail: "empty",
          message: "Cloud resource IDs must not be empty.",
        },
      ],
    });
  });

  it.each(["arn:aws\u0000:resource", "arn:aws\n:resource", "arn:aws\u200b:resource"])(
    "rejects control and format characters",
    (value) => {
      expect(validationResult(value)).toEqual({
        success: false,
        issues: [
          {
            path: ["value"],
            reason: AssetIdentifierValidationReason.InvalidFormat,
            detail: "cloud_control",
            message: "Cloud resource IDs must not contain control characters.",
          },
        ],
      });
    },
  );

  it("trims boundary controls before validating the remaining resource ID", () => {
    expect(cloudResourceIdValueSchema.parse("\t arn:aws:resource\n ")).toBe("arn:aws:resource");
  });

  it("accepts a normalized value at the maximum Unicode length", () => {
    const value = "😀".repeat(2048);

    expect(cloudResourceIdValueSchema.parse(value)).toBe(value);
  });

  it("rejects values beyond the normalized Unicode length limit", () => {
    expect(validationResult("😀".repeat(2049))).toEqual({
      success: false,
      issues: [
        {
          path: ["value"],
          reason: AssetIdentifierValidationReason.TooLong,
          detail: "cloud_value",
          message: "Identifier values must be at most 2048 characters long.",
        },
      ],
    });
  });
});
