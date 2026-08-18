import { z } from "zod/v4";

import {
  cloudResourceIdValueSchema,
  dnsNameValueSchema,
  ipAddressValueSchema,
  ociRegistryValueSchema,
  ociRepositoryPathValueSchema,
  vcsRepositoryValueSchema,
} from "./asset-identifier.js";
export {
  APPLICATION_NORMALIZATION_VERSION,
  CURRENT_NORMALIZATION_VERSION,
} from "./normalization.js";

export enum AffectedResourceType {
  Asset = "asset",
  Unspecified = "unspecified",
  WebEndpoint = "webEndpoint",
  NetworkService = "networkService",
  SourceCode = "sourceCode",
  Package = "package",
  ContainerImage = "containerImage",
  CloudResource = "cloudResource",
}

export enum WebEndpointComponentKind {
  Endpoint = "endpoint",
  QueryParameter = "queryParameter",
  PathParameter = "pathParameter",
  Header = "header",
  Cookie = "cookie",
  BodyField = "bodyField",
  Response = "response",
}

export enum NetworkTransport {
  Tcp = "tcp",
  Udp = "udp",
}

const portSchema = z.int().min(1).max(65535);
const resourceHostSchema = z.union([dnsNameValueSchema, ipAddressValueSchema]);
const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
const lowercaseTokenSchema = nonEmptyTrimmedStringSchema
  .transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^[a-z][a-z\d._+-]*$/u));
const sourceSnapshotStringSchema = z.string().min(1);

const webSchemeSchema = lowercaseTokenSchema.pipe(z.enum(["http", "https"]));
const httpMethodSchema = nonEmptyTrimmedStringSchema
  .regex(/^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/u)
  .transform((value) => value.toUpperCase());
const webPathSchema = z.string().transform((value, context) => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return "/";
  }
  if (/[#?\\\p{Cc}\p{Cf}]/u.test(normalized)) {
    context.addIssue({
      code: "custom",
      message:
        "Web endpoint paths must not contain queries, fragments, backslashes, or control characters.",
    });
    return z.NEVER;
  }

  try {
    const url = new URL(`https://affected-resource.invalid/${normalized.replace(/^\/+/, "")}`);
    return url.pathname || "/";
  } catch {
    context.addIssue({
      code: "custom",
      message: "Web endpoint paths must be valid URL paths.",
    });
    return z.NEVER;
  }
});

const endpointComponentNameSchema = nonEmptyTrimmedStringSchema;
const endpointComponentEndpointSchema = z.strictObject({
  kind: z.literal(WebEndpointComponentKind.Endpoint),
});
const endpointComponentNamedKinds = [
  WebEndpointComponentKind.QueryParameter,
  WebEndpointComponentKind.PathParameter,
  WebEndpointComponentKind.Header,
  WebEndpointComponentKind.Cookie,
  WebEndpointComponentKind.BodyField,
] as const;
const endpointComponentNamedSchema = z.strictObject({
  kind: z.enum(endpointComponentNamedKinds),
  name: endpointComponentNameSchema,
});
const endpointComponentResponseSchema = z.strictObject({
  kind: z.literal(WebEndpointComponentKind.Response),
});

export const webEndpointComponentSchema = z.discriminatedUnion("kind", [
  endpointComponentEndpointSchema,
  endpointComponentNamedSchema,
  endpointComponentResponseSchema,
]);

const sourceLocationCoordinateSchema = z.int().min(1);

export const sourceCodeLocationSchema = z
  .strictObject({
    startLine: sourceLocationCoordinateSchema,
    startColumn: sourceLocationCoordinateSchema.optional(),
    endLine: sourceLocationCoordinateSchema.optional(),
    endColumn: sourceLocationCoordinateSchema.optional(),
  })
  .superRefine((location, context) => {
    if (location.endColumn !== undefined && location.endLine === undefined) {
      context.addIssue({
        code: "custom",
        message: "An end column requires an end line.",
        path: ["endColumn"],
      });
    }
    if (location.endLine !== undefined && location.endLine < location.startLine) {
      context.addIssue({
        code: "custom",
        message: "Source locations must not end before they start.",
        path: ["endLine"],
      });
    }
    if (
      location.endLine === location.startLine &&
      location.startColumn !== undefined &&
      location.endColumn !== undefined &&
      location.endColumn < location.startColumn
    ) {
      context.addIssue({
        code: "custom",
        message: "Source locations must not end before they start.",
        path: ["endColumn"],
      });
    }
  });

const repositoryRelativePathSchema = z.string().transform((value, context) => {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("/") ||
    trimmed.includes("\\") ||
    /[\p{Cc}\p{Cf}]/u.test(trimmed)
  ) {
    context.addIssue({
      code: "custom",
      message: "Repository-relative paths must be non-empty and use forward slashes.",
    });
    return z.NEVER;
  }

  const parts: string[] = [];
  for (const part of trimmed.split("/")) {
    if (part.length === 0 || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length === 0) {
        context.addIssue({
          code: "custom",
          message: "Repository-relative paths must not escape the repository root.",
        });
        return z.NEVER;
      }
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  if (parts.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Repository-relative paths must identify a path below the repository root.",
    });
    return z.NEVER;
  }
  return parts.join("/");
});

const locationFingerprintSchema = nonEmptyTrimmedStringSchema.regex(
  /^[^:\s]+:.+$/u,
  "Location fingerprints must include an algorithm or namespace prefix.",
);

const normalizeContainerRegistry = ociRegistryValueSchema;
const containerRepositorySchema = ociRepositoryPathValueSchema;
const containerDigestSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z\d+._-]*:[a-z\d=_-]+$/iu)
  .transform((value) => {
    const separator = value.indexOf(":");
    return `${value.slice(0, separator).toLowerCase()}:${value.slice(separator + 1)}`;
  });
const containerTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z\d_][a-z\d_.-]*$/iu);

export type PackageNameNormalizer = (name: string) => string | null;

function normalizeNpmPackageName(name: string): string | null {
  const normalized = name.toLowerCase();
  return /^(?:@[a-z\d._~-]+\/)?[a-z\d._~-]+$/u.test(normalized) ? normalized : null;
}

export const packageNameNormalizerRegistry = new Map<string, PackageNameNormalizer>([
  ["npm", normalizeNpmPackageName],
]);

export function registerPackageNameNormalizer(
  ecosystem: string,
  normalizer: PackageNameNormalizer,
): void {
  const normalizedEcosystem = ecosystem.trim().toLowerCase();
  if (!/^[a-z][a-z\d._+-]*$/u.test(normalizedEcosystem)) {
    throw new Error("Package ecosystems must be lowercase token names.");
  }
  packageNameNormalizerRegistry.set(normalizedEcosystem, normalizer);
}

export function normalizePackageName(ecosystem: string | undefined, name: string): string | null {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) {
    return null;
  }
  const normalizer =
    ecosystem === undefined
      ? undefined
      : packageNameNormalizerRegistry.get(ecosystem.toLowerCase());
  if (normalizer === undefined) {
    return normalizedName;
  }
  const result = normalizer(normalizedName);
  return result === null || result.trim().length === 0 ? null : result;
}

const packageNameSchema = z.string().transform((value, context) => {
  const normalized = normalizePackageName(undefined, value);
  if (normalized === null) {
    context.addIssue({ code: "custom", message: "Package names must not be empty." });
    return z.NEVER;
  }
  return normalized;
});

const packageEcosystemSchema = lowercaseTokenSchema;
const packageVersionSchema = sourceSnapshotStringSchema;
const cloudProviderSchema = lowercaseTokenSchema;

const webEndpointFields = {
  type: z.literal(AffectedResourceType.WebEndpoint),
  scheme: webSchemeSchema.optional(),
  host: resourceHostSchema.optional(),
  port: portSchema.optional(),
  path: webPathSchema.optional(),
  method: httpMethodSchema.optional(),
  component: webEndpointComponentSchema.optional(),
};

function normalizeWebEndpoint(resource: z.output<z.ZodObject<typeof webEndpointFields>>) {
  const path = resource.path ?? "/";
  const port =
    resource.port ??
    (resource.scheme === "http" ? 80 : resource.scheme === "https" ? 443 : undefined);
  return {
    ...resource,
    path,
    ...(port === undefined ? {} : { port }),
  };
}

const findingWebEndpointSchema = z.strictObject(webEndpointFields).transform(normalizeWebEndpoint);
const observationWebEndpointSchema = z
  .strictObject({
    ...webEndpointFields,
    reportedUrl: sourceSnapshotStringSchema.optional(),
  })
  .transform(normalizeWebEndpoint);

const networkServiceFields = {
  type: z.literal(AffectedResourceType.NetworkService),
  host: resourceHostSchema.optional(),
  port: portSchema.optional(),
  transport: lowercaseTokenSchema.pipe(z.enum(NetworkTransport)).optional(),
  protocol: lowercaseTokenSchema.optional(),
};
const findingNetworkServiceSchema = z.strictObject(networkServiceFields);
const observationNetworkServiceSchema = findingNetworkServiceSchema;

const sourceCodeFields = {
  type: z.literal(AffectedResourceType.SourceCode),
  repository: vcsRepositoryValueSchema.optional(),
  file: repositoryRelativePathSchema.optional(),
  location: sourceCodeLocationSchema.optional(),
  symbol: nonEmptyTrimmedStringSchema.optional(),
  locationFingerprint: locationFingerprintSchema.optional(),
};
const findingSourceCodeSchema = z.strictObject(sourceCodeFields);
const observationSourceCodeSchema = z.strictObject({
  ...sourceCodeFields,
  revision: sourceSnapshotStringSchema.optional(),
});

const packageFields = {
  type: z.literal(AffectedResourceType.Package),
  ecosystem: packageEcosystemSchema.optional(),
  name: packageNameSchema.optional(),
  installationPath: repositoryRelativePathSchema.optional(),
};

function normalizePackage(
  resource: { ecosystem?: string; name?: string },
  context: z.RefinementCtx,
): void {
  if (resource.name !== undefined) {
    const normalized = normalizePackageName(resource.ecosystem, resource.name);
    if (normalized === null) {
      context.addIssue({
        code: "custom",
        message: "Package names must not be empty.",
        path: ["name"],
      });
    } else {
      resource.name = normalized;
    }
  }
}

const findingPackageSchema = z.strictObject(packageFields).transform((resource, context) => {
  normalizePackage(resource, context);
  return resource;
});
const observationPackageSchema = z
  .strictObject({
    ...packageFields,
    version: packageVersionSchema.optional(),
  })
  .transform((resource, context) => {
    normalizePackage(resource, context);
    return resource;
  });

const containerImageFields = {
  type: z.literal(AffectedResourceType.ContainerImage),
  registry: normalizeContainerRegistry.optional(),
  repository: containerRepositorySchema.optional(),
  digest: containerDigestSchema.optional(),
};
const findingContainerImageSchema = z.strictObject(containerImageFields);
const observationContainerImageSchema = z.strictObject({
  ...containerImageFields,
  tag: containerTagSchema.optional(),
});

const cloudResourceFields = {
  type: z.literal(AffectedResourceType.CloudResource),
  provider: cloudProviderSchema.optional(),
  providerAccount: nonEmptyTrimmedStringSchema.optional(),
  region: nonEmptyTrimmedStringSchema.optional(),
  resourceId: cloudResourceIdValueSchema.optional(),
  subresource: nonEmptyTrimmedStringSchema.optional(),
};
const findingCloudResourceSchema = z.strictObject(cloudResourceFields);
const observationCloudResourceSchema = z.strictObject({
  ...cloudResourceFields,
  displayName: sourceSnapshotStringSchema.optional(),
});

const findingAssetSchema = z.strictObject({
  type: z.literal(AffectedResourceType.Asset),
});
const findingUnspecifiedSchema = z.strictObject({
  type: z.literal(AffectedResourceType.Unspecified),
});
const observationAssetSchema = findingAssetSchema;
const observationUnspecifiedSchema = findingUnspecifiedSchema;

export const findingAffectedResourceSchema = z.discriminatedUnion("type", [
  findingAssetSchema,
  findingUnspecifiedSchema,
  findingWebEndpointSchema,
  findingNetworkServiceSchema,
  findingSourceCodeSchema,
  findingPackageSchema,
  findingContainerImageSchema,
  findingCloudResourceSchema,
]);

export const observationAffectedResourceSchema = z.discriminatedUnion("type", [
  observationAssetSchema,
  observationUnspecifiedSchema,
  observationWebEndpointSchema,
  observationNetworkServiceSchema,
  observationSourceCodeSchema,
  observationPackageSchema,
  observationContainerImageSchema,
  observationCloudResourceSchema,
]);

export const canonicalAffectedResourceSchema = findingAffectedResourceSchema;
export const affectedResourceSchema = findingAffectedResourceSchema;

export function normalizeFindingAffectedResource(input: unknown): FindingAffectedResource {
  return findingAffectedResourceSchema.parse(input);
}

export function normalizeObservationAffectedResource(input: unknown): ObservationAffectedResource {
  return observationAffectedResourceSchema.parse(input);
}

export type AssetAffectedResource = z.infer<typeof findingAssetSchema>;
export type UnspecifiedAffectedResource = z.infer<typeof findingUnspecifiedSchema>;
export type FindingAffectedResource = z.output<typeof findingAffectedResourceSchema>;
export type FindingAffectedResourceInput = z.input<typeof findingAffectedResourceSchema>;
export type ObservationAffectedResource = z.output<typeof observationAffectedResourceSchema>;
export type ObservationAffectedResourceInput = z.input<typeof observationAffectedResourceSchema>;
export type AffectedResource = FindingAffectedResource;
