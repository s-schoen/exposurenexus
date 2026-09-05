import { z } from "zod/v4";

import {
  AssetIdentifierType,
  ASSET_IDENTIFIER_NAMESPACE_MAX_LENGTH,
  ASSET_IDENTIFIER_VALUE_MAX_LENGTH,
} from "./types.js";

export const dnsNameValueSchema = z.string().min(1).max(ASSET_IDENTIFIER_VALUE_MAX_LENGTH);
export const ipAddressValueSchema = z.string().min(1).max(ASSET_IDENTIFIER_VALUE_MAX_LENGTH);
export const vcsRepositoryValueSchema = z.string().min(1).max(ASSET_IDENTIFIER_VALUE_MAX_LENGTH);
export const ociImageNameValueSchema = z.string().min(1).max(ASSET_IDENTIFIER_VALUE_MAX_LENGTH);
export const cloudResourceIdValueSchema = z.string().min(1).max(ASSET_IDENTIFIER_VALUE_MAX_LENGTH);
export const assetIdentifierNamespaceSchema = z
  .string()
  .min(1)
  .max(ASSET_IDENTIFIER_NAMESPACE_MAX_LENGTH);
const optionalNamespaceSchema = assetIdentifierNamespaceSchema.nullable().optional();

const dnsNameIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.DnsName),
  namespace: optionalNamespaceSchema.default(null),
  value: dnsNameValueSchema,
});

const ipAddressIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.IpAddress),
  namespace: optionalNamespaceSchema.default(null),
  value: ipAddressValueSchema,
});

const vcsRepositoryIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.VcsRepository),
  namespace: optionalNamespaceSchema.default(null),
  value: vcsRepositoryValueSchema,
});

const ociImageNameIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.OciImageName),
  namespace: optionalNamespaceSchema.default(null),
  value: ociImageNameValueSchema,
});

const cloudResourceIdIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.CloudResourceId),
  namespace: optionalNamespaceSchema.default(null),
  value: cloudResourceIdValueSchema,
});

const dnsNameIdentifierRecordSchema = z.strictObject({
  id: z.uuidv4(),
  type: z.literal(AssetIdentifierType.DnsName),
  namespace: assetIdentifierNamespaceSchema.nullable(),
  value: dnsNameValueSchema,
});

const ipAddressIdentifierRecordSchema = z.strictObject({
  id: z.uuidv4(),
  type: z.literal(AssetIdentifierType.IpAddress),
  namespace: assetIdentifierNamespaceSchema.nullable(),
  value: ipAddressValueSchema,
});

const vcsRepositoryIdentifierRecordSchema = z.strictObject({
  id: z.uuidv4(),
  type: z.literal(AssetIdentifierType.VcsRepository),
  namespace: assetIdentifierNamespaceSchema.nullable(),
  value: vcsRepositoryValueSchema,
});

const ociImageNameIdentifierRecordSchema = z.strictObject({
  id: z.uuidv4(),
  type: z.literal(AssetIdentifierType.OciImageName),
  namespace: assetIdentifierNamespaceSchema.nullable(),
  value: ociImageNameValueSchema,
});

const cloudResourceIdIdentifierRecordSchema = z.strictObject({
  id: z.uuidv4(),
  type: z.literal(AssetIdentifierType.CloudResourceId),
  namespace: assetIdentifierNamespaceSchema.nullable(),
  value: cloudResourceIdValueSchema,
});

export const assetIdentifierSchema = z.discriminatedUnion("type", [
  dnsNameIdentifierSchema,
  ipAddressIdentifierSchema,
  vcsRepositoryIdentifierSchema,
  ociImageNameIdentifierSchema,
  cloudResourceIdIdentifierSchema,
]);

export const assetIdentifierRecordSchema = z.discriminatedUnion("type", [
  dnsNameIdentifierRecordSchema,
  ipAddressIdentifierRecordSchema,
  vcsRepositoryIdentifierRecordSchema,
  ociImageNameIdentifierRecordSchema,
  cloudResourceIdIdentifierRecordSchema,
]);

export const createAssetIdentifierSchema = assetIdentifierSchema;
export const updateAssetIdentifierSchema = assetIdentifierSchema;

export type AssetIdentifier = z.infer<typeof assetIdentifierSchema>;
export type AssetIdentifierInput = z.input<typeof assetIdentifierSchema>;
export type AssetIdentifierRecord = z.infer<typeof assetIdentifierRecordSchema>;
export type CreateAssetIdentifier = z.input<typeof createAssetIdentifierSchema>;
export type UpdateAssetIdentifier = z.input<typeof updateAssetIdentifierSchema>;
