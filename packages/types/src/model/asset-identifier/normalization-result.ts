import { ASSET_IDENTIFIER_VALUE_MAX_LENGTH, AssetIdentifierValidationReason } from "./types.js";

export type NormalizationFailure = {
  success: false;
  reason: AssetIdentifierValidationReason;
  detail: string;
  message: string;
};

export type NormalizationSuccess = {
  success: true;
  value: string;
};

export type NormalizationResult = NormalizationFailure | NormalizationSuccess;

export const invalidControlOrWhitespacePattern = /[\p{Cc}\p{Cf}\s]/u;
export const schemePattern = /^([a-z][a-z\d+.-]*):\/\//i;

export function characterLength(value: string): number {
  return Array.from(value).length;
}

export function failure(
  reason: AssetIdentifierValidationReason,
  detail: string,
  message: string,
): NormalizationFailure {
  return { success: false, reason, detail, message };
}

export function invalidFormat(detail: string, message: string): NormalizationFailure {
  return failure(AssetIdentifierValidationReason.InvalidFormat, detail, message);
}

export function finishValue(value: string, detail: string): NormalizationResult {
  if (value.length === 0) {
    return failure(
      AssetIdentifierValidationReason.Empty,
      "empty",
      "Identifier values must not be empty.",
    );
  }

  if (characterLength(value) > ASSET_IDENTIFIER_VALUE_MAX_LENGTH) {
    return failure(
      AssetIdentifierValidationReason.TooLong,
      detail,
      `Identifier values must be at most ${ASSET_IDENTIFIER_VALUE_MAX_LENGTH} characters long.`,
    );
  }

  return { success: true, value };
}
