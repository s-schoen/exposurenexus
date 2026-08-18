import { z } from "zod/v4";

import { normalizeCloudResourceId } from "./cloud-resource-id.js";
import { normalizeDnsName } from "./dns-name.js";
import { normalizeIpAddress } from "./ip-address.js";
import { characterLength, type NormalizationResult } from "./normalization-result.js";
import { normalizeOciImageName } from "./oci-image-name.js";
import {
  ASSET_IDENTIFIER_NAMESPACE_MAX_LENGTH,
  AssetIdentifierType,
  AssetIdentifierValidationReason,
  type AssetIdentifierValidationIssue,
} from "./types.js";
import { normalizeVcsRepository } from "./vcs-repository.js";

function createValueSchema(normalize: (value: string) => NormalizationResult) {
  return z.string().transform((value, context) => {
    const result = normalize(value);
    if (!result.success) {
      context.addIssue({
        code: "custom",
        message: result.message,
        params: {
          reason: result.reason,
          detail: result.detail,
        },
      });
      return z.NEVER;
    }
    return result.value;
  });
}

export const dnsNameValueSchema = createValueSchema(normalizeDnsName);
export const ipAddressValueSchema = createValueSchema(normalizeIpAddress);
export const vcsRepositoryValueSchema = createValueSchema(normalizeVcsRepository);
export const ociImageNameValueSchema = createValueSchema(normalizeOciImageName);
export const cloudResourceIdValueSchema = createValueSchema(normalizeCloudResourceId);

export const assetIdentifierNamespaceSchema = z.string().transform((value, context) => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Identifier namespaces must not be empty.",
      params: {
        reason: AssetIdentifierValidationReason.Empty,
        detail: "namespace_empty",
      },
    });
    return z.NEVER;
  }
  if (characterLength(normalized) > ASSET_IDENTIFIER_NAMESPACE_MAX_LENGTH) {
    context.addIssue({
      code: "custom",
      message: `Identifier namespaces must be at most ${ASSET_IDENTIFIER_NAMESPACE_MAX_LENGTH} characters long.`,
      params: {
        reason: AssetIdentifierValidationReason.TooLong,
        detail: "namespace_length",
      },
    });
    return z.NEVER;
  }
  return normalized;
});

const optionalNamespaceSchema = assetIdentifierNamespaceSchema.nullable().optional();

const dnsNameIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.DnsName),
  namespace: optionalNamespaceSchema,
  value: dnsNameValueSchema,
});

const ipAddressIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.IpAddress),
  namespace: optionalNamespaceSchema,
  value: ipAddressValueSchema,
});

const vcsRepositoryIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.VcsRepository),
  namespace: optionalNamespaceSchema,
  value: vcsRepositoryValueSchema,
});

const ociImageNameIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.OciImageName),
  namespace: optionalNamespaceSchema,
  value: ociImageNameValueSchema,
});

const cloudResourceIdIdentifierSchema = z.strictObject({
  type: z.literal(AssetIdentifierType.CloudResourceId),
  namespace: optionalNamespaceSchema,
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

export const assetIdentifierSchema = z
  .discriminatedUnion("type", [
    dnsNameIdentifierSchema,
    ipAddressIdentifierSchema,
    vcsRepositoryIdentifierSchema,
    ociImageNameIdentifierSchema,
    cloudResourceIdIdentifierSchema,
  ])
  .transform((identifier) => ({
    ...identifier,
    namespace: identifier.namespace ?? null,
  }));

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

export type AssetIdentifierValidationResult =
  | {
      success: true;
      data: AssetIdentifier;
    }
  | {
      success: false;
      issues: AssetIdentifierValidationIssue[];
    };

export function normalizeAssetIdentifier(input: unknown): AssetIdentifier {
  return assetIdentifierSchema.parse(input);
}

type SchemaIssue = {
  code: string;
  path: Array<string | number>;
  message: string;
  params?: unknown;
};

function isValidationReason(value: unknown): value is AssetIdentifierValidationReason {
  return Object.values(AssetIdentifierValidationReason).includes(
    value as AssetIdentifierValidationReason,
  );
}

function issueReason(code: string): AssetIdentifierValidationReason {
  switch (code) {
    case "invalid_type":
      return AssetIdentifierValidationReason.InvalidType;
    case "invalid_value":
    case "invalid_union":
      return AssetIdentifierValidationReason.InvalidValue;
    case "too_small":
      return AssetIdentifierValidationReason.Empty;
    case "too_big":
      return AssetIdentifierValidationReason.TooLong;
    case "unrecognized_keys":
      return AssetIdentifierValidationReason.UnrecognizedKey;
    default:
      return AssetIdentifierValidationReason.InvalidFormat;
  }
}

function mapValidationIssue(issue: SchemaIssue): AssetIdentifierValidationIssue {
  const params = issue.params;
  const detail =
    typeof params === "object" &&
    params !== null &&
    "detail" in params &&
    typeof params.detail === "string"
      ? params.detail
      : undefined;
  const requestedReason =
    typeof params === "object" && params !== null && "reason" in params ? params.reason : undefined;

  return {
    path: [...issue.path],
    reason: isValidationReason(requestedReason) ? requestedReason : issueReason(issue.code),
    ...(detail === undefined ? {} : { detail }),
    message: issue.message,
  };
}

export function validateAssetIdentifier(input: unknown): AssetIdentifierValidationResult {
  const result = assetIdentifierSchema.safeParse(input);
  if (result.success) {
    return result;
  }

  return {
    success: false,
    issues: result.error.issues.map((issue) => mapValidationIssue(issue as SchemaIssue)),
  };
}
