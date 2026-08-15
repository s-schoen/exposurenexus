export {
  ASSET_IDENTIFIER_NAMESPACE_MAX_LENGTH,
  ASSET_IDENTIFIER_VALUE_MAX_LENGTH,
  AssetIdentifierType,
  AssetIdentifierValidationReason,
  assetIdentifierTypeSchema,
} from "./asset-identifier/types.js";
export type { AssetIdentifierValidationIssue } from "./asset-identifier/types.js";
export {
  assetIdentifierNamespaceSchema,
  assetIdentifierSchema,
  cloudResourceIdValueSchema,
  dnsNameValueSchema,
  ipAddressValueSchema,
  normalizeAssetIdentifier,
  ociImageNameValueSchema,
  validateAssetIdentifier,
  vcsRepositoryValueSchema,
} from "./asset-identifier/schema.js";
export type {
  AssetIdentifier,
  AssetIdentifierInput,
  AssetIdentifierValidationResult,
} from "./asset-identifier/schema.js";
