import { z } from "zod/v4";

export enum AssetIdentifierType {
  DnsName = "dnsName",
  IpAddress = "ipAddress",
  VcsRepository = "vcsRepository",
  OciImageName = "ociImageName",
  CloudResourceId = "cloudResourceId",
}

export const ASSET_IDENTIFIER_VALUE_MAX_LENGTH = 2048;
export const ASSET_IDENTIFIER_NAMESPACE_MAX_LENGTH = 255;

export const assetIdentifierTypeSchema = z.enum(AssetIdentifierType);

export enum AssetIdentifierValidationReason {
  InvalidType = "invalid_type",
  InvalidValue = "invalid_value",
  InvalidFormat = "invalid_format",
  Empty = "empty",
  TooLong = "too_long",
  UnrecognizedKey = "unrecognized_key",
}

export interface AssetIdentifierValidationIssue {
  path: Array<string | number>;
  reason: AssetIdentifierValidationReason;
  detail?: string;
  message: string;
}
