import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { ObservationSource } from "@exposurenexus/contracts/model/observation";
import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";

import { DEFAULT_ACTOR_ID } from "@/mocks/fixtures/ids.ts";

import type { AuthSessionDataReply } from "@exposurenexus/contracts/api";
import type { Asset, AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { Observation } from "@exposurenexus/contracts/model/observation";
import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";

export const SEED_ROLES: Array<Role> = [
  {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.CustomField, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read },
    ],
  },
  {
    id: builtInRoleIds.editor,
    name: BuiltInRoleName.Editor,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Delete },
      { resource: PermissionResource.CustomField, verb: PermissionVerb.Read },
      { resource: PermissionResource.CustomField, verb: PermissionVerb.Write },
      { resource: PermissionResource.CustomField, verb: PermissionVerb.Delete },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Write },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Delete },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Write,
      },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Delete,
      },
      { resource: PermissionResource.Import, verb: PermissionVerb.Write },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read },
    ],
  },
  {
    id: builtInRoleIds.admin,
    name: BuiltInRoleName.Admin,
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Delete },
      { resource: PermissionResource.CustomField, verb: PermissionVerb.Read },
      { resource: PermissionResource.CustomField, verb: PermissionVerb.Write },
      { resource: PermissionResource.CustomField, verb: PermissionVerb.Delete },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Write },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Delete },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Write,
      },
      {
        resource: PermissionResource.Vulnerability,
        verb: PermissionVerb.Delete,
      },
      { resource: PermissionResource.Import, verb: PermissionVerb.Write },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Write },
      { resource: PermissionResource.User, verb: PermissionVerb.Delete },
    ],
  },
  {
    id: "8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0",
    name: "security-auditor",
    permissions: [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      { resource: PermissionResource.Vulnerability, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.Stats, verb: PermissionVerb.Read },
    ],
  },
];

export const BUILT_IN_ADMIN_ROLE = SEED_ROLES[2];
export const CUSTOM_AUDITOR_ROLE = SEED_ROLES[3];

export const USER_FORM_ROLE_FIXTURES: Array<Role> = [
  {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: [{ resource: PermissionResource.User, verb: PermissionVerb.Read }],
  },
  {
    id: builtInRoleIds.editor,
    name: BuiltInRoleName.Editor,
    permissions: [
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Write },
    ],
  },
  {
    id: builtInRoleIds.admin,
    name: BuiltInRoleName.Admin,
    permissions: [
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Write },
      { resource: PermissionResource.User, verb: PermissionVerb.Delete },
    ],
  },
];

export const SEED_CUSTOM_FIELDS: Array<AssetCustomFieldDefinition> = [
  {
    id: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
    key: "category",
    name: "Category",
    required: false,
    type: AssetCustomFieldType.Text,
    defaultValue: null,
  },
  {
    id: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
    key: "priority",
    name: "Priority",
    required: true,
    type: AssetCustomFieldType.Number,
    defaultValue: 3,
  },
  {
    id: "7f732d2b-8985-4551-b45d-0eaf527a1577",
    key: "tier",
    name: "Deployment tier",
    required: true,
    type: AssetCustomFieldType.Select,
    defaultValue: "production",
    options: [
      {
        id: "6b567696-6808-45be-ab67-a8683d98a138",
        fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
        value: "production",
        label: "Production",
      },
      {
        id: "1dec1f7b-0650-4e64-bdfa-1d4228a99e87",
        fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
        value: "staging",
        label: "Staging",
      },
    ],
  },
];

const DEPLOYMENT_TIER_OPTIONS = [
  {
    id: "6b567696-6808-45be-ab67-a8683d98a138",
    fieldId: SEED_CUSTOM_FIELDS[2].id,
    value: "production",
    label: "Production",
  },
  {
    id: "1dec1f7b-0650-4e64-bdfa-1d4228a99e87",
    fieldId: SEED_CUSTOM_FIELDS[2].id,
    value: "staging",
    label: "Staging",
  },
];

export const SEED_USERS: Array<UserProfile> = [
  {
    id: DEFAULT_ACTOR_ID,
    username: "robin",
    displayName: "Robin Owner",
    email: "robin@example.com",
    enabled: true,
    roleIds: [SEED_ROLES[2].id],
  },
  {
    id: "bb9f2b64-2f45-4bb8-9f16-659d633cb398",
    username: "morgan",
    displayName: "Morgan Analyst",
    email: "morgan@example.com",
    enabled: true,
    roleIds: [SEED_ROLES[1].id, SEED_ROLES[3].id],
  },
  {
    id: "7b413aba-5164-456b-8ffd-88fb6b99bbed",
    username: "casey",
    displayName: "Casey Disabled",
    email: "casey@example.com",
    enabled: false,
    roleIds: [],
  },
];

export const SEED_AUTH_SESSION: AuthSessionDataReply = {
  user: SEED_USERS[0],
  session: {
    id: "7d42e746-7950-4db9-91d8-22b22d2f17cd",
    userId: SEED_USERS[0].id,
    sourceIp: "203.0.113.10",
    userAgent: "Vitest",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    expiresAt: new Date("2026-01-03T03:04:05.000Z"),
  },
};

export const SEED_ASSETS: Array<Asset> = [
  {
    id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    displayName: "web-01",
    type: AssetType.Host,
    environment: AssetEnvironment.Production,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: SEED_USERS[0].id,
    identifiers: [
      {
        id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
        type: AssetIdentifierType.DnsName,
        namespace: null,
        value: "web-01.example.com",
      },
    ],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: SEED_USERS[0].id,
    updatedBy: SEED_USERS[1].id,
  },
  {
    id: "0bb9b410-7763-4e7a-9942-b752367fd63d",
    displayName: "container-01",
    type: AssetType.ContainerImage,
    environment: AssetEnvironment.Staging,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: null,
    identifiers: [
      {
        id: "2db67190-9d84-482f-9936-cfbf4244752b",
        type: AssetIdentifierType.OciImageName,
        namespace: null,
        value: "ghcr.io/exposurenexus/container",
      },
    ],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: SEED_USERS[0].id,
    updatedBy: SEED_USERS[1].id,
  },
  {
    id: "4eaf1ce4-51f4-4a63-80b4-7b550e91050d",
    displayName: "api-worker",
    type: AssetType.Software,
    environment: AssetEnvironment.Development,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: SEED_USERS[1].id,
    identifiers: [
      {
        id: "f1c4c65c-4486-4a4d-b3fc-86f702390ba3",
        type: AssetIdentifierType.VcsRepository,
        namespace: "engineering",
        value: "github.com/exposurenexus/api",
      },
    ],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: SEED_USERS[0].id,
    updatedBy: SEED_USERS[1].id,
  },
];

export const SEED_ASSETS_WITH_CUSTOM_FIELDS: Array<AssetWithCustomFields> = [
  {
    ...SEED_ASSETS[0],
    customFields: [
      {
        fieldId: SEED_CUSTOM_FIELDS[0].id,
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "Internet-facing",
      },
      {
        fieldId: SEED_CUSTOM_FIELDS[1].id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Number,
        value: 3,
      },
      {
        fieldId: SEED_CUSTOM_FIELDS[2].id,
        key: "tier",
        name: "Deployment tier",
        options: DEPLOYMENT_TIER_OPTIONS,
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "production",
      },
    ],
  },
  {
    ...SEED_ASSETS[1],
    customFields: [
      {
        fieldId: SEED_CUSTOM_FIELDS[0].id,
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "Runtime",
      },
      {
        fieldId: SEED_CUSTOM_FIELDS[1].id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Number,
        value: 2,
      },
      {
        fieldId: SEED_CUSTOM_FIELDS[2].id,
        key: "tier",
        name: "Deployment tier",
        options: DEPLOYMENT_TIER_OPTIONS,
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "staging",
      },
    ],
  },
  {
    ...SEED_ASSETS[2],
    customFields: [],
  },
];

export const SEED_VULNERABILITIES: Array<VulnerabilityCatalog> = [
  {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    type: VulnerabilityType.Cve,
    identifier: "CVE-2026-0001",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interfaces are reachable from the internet.",
    metadata: { cvss: 8.1 },
    createdBy: SEED_USERS[0].id,
    updatedBy: SEED_USERS[1].id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  },
  {
    id: "4fb566c6-e642-48d8-b70d-418efb074f8d",
    type: VulnerabilityType.Custom,
    identifier: "account-takeover",
    title: "Account Takeover",
    severity: VulnerabilitySeverity.Critical,
    description: "Authentication controls can be bypassed.",
    metadata: null,
    createdBy: SEED_USERS[0].id,
    updatedBy: SEED_USERS[1].id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  },
  {
    id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
    type: VulnerabilityType.Cwe,
    identifier: "CWE-1104",
    title: "Outdated API Dependency",
    severity: VulnerabilitySeverity.Medium,
    description: null,
    metadata: null,
    createdBy: SEED_USERS[1].id,
    updatedBy: SEED_USERS[1].id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  },
];

const [WEB_01, CONTAINER_01, API_WORKER] = SEED_ASSETS;
const [ADMIN_ENDPOINT_CVE, , OUTDATED_DEPENDENCY_CWE] = SEED_VULNERABILITIES;

const ADMIN_ENDPOINT_FINDING_ID = "023eb4f0-a658-44fe-a062-af7dd55a4bc2";
const OUTDATED_DEPENDENCY_FINDING_ID = "f9f09fad-104d-4d1a-8d0e-d991138c2cb7";

export const SEED_OBSERVATIONS: Array<Observation> = [
  {
    id: "6d8f775d-a527-4a68-ae64-86ccb8cdba43",
    findingId: ADMIN_ENDPOINT_FINDING_ID,
    title: "Admin panel reachable without VPN",
    description: "The admin login page answered from a public network.",
    evidence: "GET https://web-01.example.com/admin -> 200",
    remediation: "Restrict /admin to the internal network.",
    severity: VulnerabilitySeverity.High,
    weakness: { identifiers: { cwe: ["CWE-284"] } },
    affectedResource: {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "web-01.example.com",
      path: "/admin",
      method: "GET",
      reportedUrl: "https://web-01.example.com/admin",
    },
    fingerprints: {},
    source: ObservationSource.Manual,
    ingestionId: null,
    observedAt: new Date("2026-01-05T09:00:00.000Z"),
    createdAt: new Date("2026-01-05T09:00:00.000Z"),
    updatedAt: new Date("2026-01-05T09:00:00.000Z"),
    createdBy: SEED_USERS[1].id,
    updatedBy: SEED_USERS[1].id,
  },
  {
    id: "1812d299-9792-495e-b05f-abefa5c925b3",
    findingId: ADMIN_ENDPOINT_FINDING_ID,
    title: "Exposed admin endpoint",
    description: null,
    evidence: null,
    remediation: null,
    severity: VulnerabilitySeverity.High,
    weakness: { identifiers: { cwe: ["CWE-284"] } },
    affectedResource: {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "web-01.example.com",
      path: "/admin",
    },
    fingerprints: { nuclei: ["exposed-admin-panel"] },
    source: ObservationSource.Nuclei,
    ingestionId: "9ebad20b-2842-4738-99e5-67df7fcfc079",
    observedAt: new Date("2026-01-08T12:30:00.000Z"),
    createdAt: new Date("2026-01-08T12:30:00.000Z"),
    updatedAt: new Date("2026-01-08T12:30:00.000Z"),
    createdBy: SEED_USERS[0].id,
    updatedBy: SEED_USERS[0].id,
  },
  {
    id: "fd08923c-2963-49d2-bcdf-e61402b19ae2",
    findingId: OUTDATED_DEPENDENCY_FINDING_ID,
    title: "lodash 4.17.15 in package-lock.json",
    description: null,
    evidence: null,
    remediation: "Upgrade lodash to 4.17.21 or later.",
    severity: VulnerabilitySeverity.Medium,
    weakness: { identifiers: { cwe: ["CWE-1104"] } },
    affectedResource: {
      type: AffectedResourceType.Package,
      ecosystem: "npm",
      name: "lodash",
      version: "4.17.15",
    },
    fingerprints: {},
    source: ObservationSource.Manual,
    ingestionId: null,
    observedAt: new Date("2026-01-03T15:00:00.000Z"),
    createdAt: new Date("2026-01-03T15:00:00.000Z"),
    updatedAt: new Date("2026-01-03T15:00:00.000Z"),
    createdBy: SEED_USERS[1].id,
    updatedBy: SEED_USERS[1].id,
  },
];

export const SEED_FINDINGS: Array<Finding> = [
  {
    id: ADMIN_ENDPOINT_FINDING_ID,
    assetId: WEB_01.id,
    title: "Exposed admin endpoint",
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    assigneeId: SEED_USERS[1].id,
    dueDate: new Date("2026-02-01T00:00:00.000Z"),
    mitigation: null,
    weakness: { identifiers: { cwe: ["CWE-284"] } },
    affectedResource: {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "web-01.example.com",
      path: "/admin",
    },
    vulnerabilities: [ADMIN_ENDPOINT_CVE],
    observationCount: 2,
    firstSeen: SEED_OBSERVATIONS[0].observedAt,
    lastSeen: SEED_OBSERVATIONS[1].observedAt,
    createdAt: new Date("2026-01-05T09:00:00.000Z"),
    updatedAt: new Date("2026-01-08T12:30:00.000Z"),
    createdBy: SEED_USERS[1].id,
    updatedBy: SEED_USERS[0].id,
  },
  {
    id: OUTDATED_DEPENDENCY_FINDING_ID,
    assetId: API_WORKER.id,
    title: "Outdated API dependency",
    severity: VulnerabilitySeverity.Medium,
    status: FindingStatus.Confirmed,
    assigneeId: null,
    dueDate: null,
    mitigation: null,
    weakness: { identifiers: { cwe: ["CWE-1104"] } },
    affectedResource: {
      type: AffectedResourceType.Package,
      ecosystem: "npm",
      name: "lodash",
    },
    vulnerabilities: [OUTDATED_DEPENDENCY_CWE],
    observationCount: 1,
    firstSeen: SEED_OBSERVATIONS[2].observedAt,
    lastSeen: SEED_OBSERVATIONS[2].observedAt,
    createdAt: new Date("2026-01-03T15:00:00.000Z"),
    updatedAt: new Date("2026-01-04T10:00:00.000Z"),
    createdBy: SEED_USERS[1].id,
    updatedBy: SEED_USERS[1].id,
  },
  {
    id: "97cf37a9-abf2-4039-aa10-e0cdf59f5534",
    assetId: CONTAINER_01.id,
    title: "Container runs as root",
    severity: VulnerabilitySeverity.Critical,
    status: FindingStatus.Active,
    assigneeId: SEED_USERS[0].id,
    dueDate: new Date("2026-01-20T00:00:00.000Z"),
    mitigation: null,
    weakness: { identifiers: { cwe: ["CWE-250"] } },
    affectedResource: {
      type: AffectedResourceType.ContainerImage,
      registry: "ghcr.io",
      repository: "exposurenexus/container",
    },
    vulnerabilities: [],
    observationCount: 0,
    firstSeen: null,
    lastSeen: null,
    createdAt: new Date("2026-01-06T08:00:00.000Z"),
    updatedAt: new Date("2026-01-06T08:00:00.000Z"),
    createdBy: SEED_USERS[0].id,
    updatedBy: SEED_USERS[0].id,
  },
  {
    id: "10b2c634-7dd8-4e03-892a-0c5b956bbaf4",
    assetId: WEB_01.id,
    title: "Weak TLS configuration",
    severity: VulnerabilitySeverity.Low,
    status: FindingStatus.Mitigated,
    assigneeId: null,
    dueDate: null,
    mitigation: "Disabled TLS 1.0 and 1.1 on the load balancer.",
    weakness: { identifiers: { cwe: ["CWE-326"] } },
    affectedResource: {
      type: AffectedResourceType.NetworkService,
      host: "web-01.example.com",
      port: 443,
      protocol: "https",
    },
    vulnerabilities: [],
    observationCount: 0,
    firstSeen: null,
    lastSeen: null,
    createdAt: new Date("2026-01-02T08:00:00.000Z"),
    updatedAt: new Date("2026-01-09T08:00:00.000Z"),
    createdBy: SEED_USERS[0].id,
    updatedBy: SEED_USERS[0].id,
  },
];
