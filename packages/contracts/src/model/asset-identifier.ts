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
  assetIdentifierRecordSchema,
  assetIdentifierSchema,
  cloudResourceIdValueSchema,
  createAssetIdentifierSchema,
  dnsNameValueSchema,
  ipAddressValueSchema,
  ociImageNameValueSchema,
  updateAssetIdentifierSchema,
  vcsRepositoryValueSchema,
} from "./asset-identifier/schema.js";
export type {
  AssetIdentifier,
  AssetIdentifierInput,
  AssetIdentifierRecord,
  CreateAssetIdentifier,
  UpdateAssetIdentifier,
} from "./asset-identifier/schema.js";
