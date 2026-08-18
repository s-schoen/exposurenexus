import { z } from "zod/v4";

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

const webEndpointComponentSchema = z.strictObject({
  kind: z.enum(WebEndpointComponentKind),
  name: z.string().optional(),
});

const sourceCodeLocationSchema = z.strictObject({
  startLine: z.number(),
  startColumn: z.number().optional(),
  endLine: z.number().optional(),
  endColumn: z.number().optional(),
});

const webEndpointFields = {
  type: z.literal(AffectedResourceType.WebEndpoint),
  scheme: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  path: z.string().optional(),
  method: z.string().optional(),
  component: webEndpointComponentSchema.optional(),
};
const findingWebEndpointSchema = z.strictObject(webEndpointFields);
const observationWebEndpointSchema = findingWebEndpointSchema.extend({
  reportedUrl: z.string().optional(),
});

const networkServiceSchema = z.strictObject({
  type: z.literal(AffectedResourceType.NetworkService),
  host: z.string().optional(),
  port: z.number().optional(),
  transport: z.string().optional(),
  protocol: z.string().optional(),
});

const sourceCodeFields = {
  type: z.literal(AffectedResourceType.SourceCode),
  repository: z.string().optional(),
  file: z.string().optional(),
  location: sourceCodeLocationSchema.optional(),
  symbol: z.string().optional(),
  locationFingerprint: z.string().optional(),
};
const findingSourceCodeSchema = z.strictObject(sourceCodeFields);
const observationSourceCodeSchema = findingSourceCodeSchema.extend({
  revision: z.string().optional(),
});

const packageFields = {
  type: z.literal(AffectedResourceType.Package),
  ecosystem: z.string().optional(),
  name: z.string().optional(),
  installationPath: z.string().optional(),
};
const findingPackageSchema = z.strictObject(packageFields);
const observationPackageSchema = findingPackageSchema.extend({
  version: z.string().optional(),
});

const containerImageFields = {
  type: z.literal(AffectedResourceType.ContainerImage),
  registry: z.string().optional(),
  repository: z.string().optional(),
  digest: z.string().optional(),
};
const findingContainerImageSchema = z.strictObject(containerImageFields);
const observationContainerImageSchema = findingContainerImageSchema.extend({
  tag: z.string().optional(),
});

const cloudResourceFields = {
  type: z.literal(AffectedResourceType.CloudResource),
  provider: z.string().optional(),
  providerAccount: z.string().optional(),
  region: z.string().optional(),
  resourceId: z.string().optional(),
  subresource: z.string().optional(),
};
const findingCloudResourceSchema = z.strictObject(cloudResourceFields);
const observationCloudResourceSchema = findingCloudResourceSchema.extend({
  displayName: z.string().optional(),
});

const assetSchema = z.strictObject({
  type: z.literal(AffectedResourceType.Asset),
});
const unspecifiedSchema = z.strictObject({
  type: z.literal(AffectedResourceType.Unspecified),
});

export const findingAffectedResourceSchema = z.discriminatedUnion("type", [
  assetSchema,
  unspecifiedSchema,
  findingWebEndpointSchema,
  networkServiceSchema,
  findingSourceCodeSchema,
  findingPackageSchema,
  findingContainerImageSchema,
  findingCloudResourceSchema,
]);

export const observationAffectedResourceSchema = z.discriminatedUnion("type", [
  assetSchema,
  unspecifiedSchema,
  observationWebEndpointSchema,
  networkServiceSchema,
  observationSourceCodeSchema,
  observationPackageSchema,
  observationContainerImageSchema,
  observationCloudResourceSchema,
]);

export type FindingAffectedResource = z.output<typeof findingAffectedResourceSchema>;
export type ObservationAffectedResource = z.output<typeof observationAffectedResourceSchema>;
export type ObservationAffectedResourceInput = z.input<typeof observationAffectedResourceSchema>;
