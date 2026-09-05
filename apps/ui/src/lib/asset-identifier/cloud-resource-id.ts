import { AssetIdentifierValidationReason } from "@exposurenexus/contracts/model/asset-identifier";

import { failure, finishValue, invalidFormat } from "@/lib/asset-identifier/normalization-result";

import type { NormalizationResult } from "@/lib/asset-identifier/normalization-result";

export function normalizeCloudResourceId(value: string): NormalizationResult {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return failure(
      AssetIdentifierValidationReason.Empty,
      "empty",
      "Cloud resource IDs must not be empty.",
    );
  }
  if (/[\p{Cc}\p{Cf}]/u.test(normalized)) {
    return invalidFormat(
      "cloud_control",
      "Cloud resource IDs must not contain control characters.",
    );
  }
  return finishValue(normalized, "cloud_value");
}
