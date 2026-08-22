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
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";

import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts";
import { ROLE_FIXTURES } from "@/components/role-fixtures.ts";

import type { AuthSessionDataReply } from "@exposurenexus/contracts/api";
import type { Asset, AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";

const STORY_ENVIRONMENT_OPTIONS = [
  {
    id: "6b567696-6808-45be-ab67-a8683d98a138",
    fieldId: ASSET_CUSTOM_FIELD_FIXTURES[2].id,
    value: "production",
    label: "Production",
  },
  {
    id: "1dec1f7b-0650-4e64-bdfa-1d4228a99e87",
    fieldId: ASSET_CUSTOM_FIELD_FIXTURES[2].id,
    value: "staging",
    label: "Staging",
  },
];

export const STORY_USERS: Array<UserProfile> = [
  {
    id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    username: "robin",
    displayName: "Robin Owner",
    email: "robin@example.com",
    enabled: true,
    roleIds: [ROLE_FIXTURES[2].id],
  },
  {
    id: "bb9f2b64-2f45-4bb8-9f16-659d633cb398",
    username: "morgan",
    displayName: "Morgan Analyst",
    email: "morgan@example.com",
    enabled: true,
    roleIds: [ROLE_FIXTURES[1].id, ROLE_FIXTURES[3].id],
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

export const STORY_AUTH_SESSION: AuthSessionDataReply = {
  user: STORY_USERS[0],
  session: {
    id: "7d42e746-7950-4db9-91d8-22b22d2f17cd",
    userId: STORY_USERS[0].id,
    sourceIp: "203.0.113.10",
    userAgent: "Storybook",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    expiresAt: new Date("2026-01-03T03:04:05.000Z"),
  },
};

export const STORY_ASSETS: Array<Asset> = [
  {
    id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    displayName: "web-01",
    type: AssetType.Host,
    environment: AssetEnvironment.Production,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: STORY_USERS[0].id,
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
    createdBy: STORY_USERS[0].id,
    updatedBy: STORY_USERS[1].id,
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
    createdBy: STORY_USERS[0].id,
    updatedBy: STORY_USERS[1].id,
  },
  {
    id: "4eaf1ce4-51f4-4a63-80b4-7b550e91050d",
    displayName: "api-worker",
    type: AssetType.Software,
    environment: AssetEnvironment.Development,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: STORY_USERS[1].id,
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
    createdBy: STORY_USERS[0].id,
    updatedBy: STORY_USERS[1].id,
  },
];

export const STORY_ASSETS_WITH_CUSTOM_FIELDS: Array<AssetWithCustomFields> = [
  {
    ...STORY_ASSETS[0],
    customFields: [
      {
        fieldId: ASSET_CUSTOM_FIELD_FIXTURES[0].id,
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "Internet-facing",
      },
      {
        fieldId: ASSET_CUSTOM_FIELD_FIXTURES[1].id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Default,
        type: AssetCustomFieldType.Number,
        value: 3,
      },
      {
        fieldId: ASSET_CUSTOM_FIELD_FIXTURES[2].id,
        key: "deployment_tier",
        name: "Deployment tier",
        options: STORY_ENVIRONMENT_OPTIONS,
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "production",
      },
    ],
  },
  {
    ...STORY_ASSETS[1],
    customFields: [
      {
        fieldId: ASSET_CUSTOM_FIELD_FIXTURES[0].id,
        key: "category",
        name: "Category",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Text,
        value: "Runtime",
      },
      {
        fieldId: ASSET_CUSTOM_FIELD_FIXTURES[1].id,
        key: "priority",
        name: "Priority",
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Number,
        value: 2,
      },
      {
        fieldId: ASSET_CUSTOM_FIELD_FIXTURES[2].id,
        key: "deployment_tier",
        name: "Deployment tier",
        options: STORY_ENVIRONMENT_OPTIONS,
        source: AssetCustomFieldValueSource.Asset,
        type: AssetCustomFieldType.Select,
        value: "staging",
      },
    ],
  },
  {
    ...STORY_ASSETS[2],
    customFields: [],
  },
];

export const STORY_VULNERABILITIES: Array<VulnerabilityCatalog> = [
  {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    type: VulnerabilityType.Cve,
    identifier: "CVE-2026-0001",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interfaces are reachable from the internet.",
    metadata: { cvss: 8.1 },
    createdBy: STORY_USERS[0].id,
    updatedBy: STORY_USERS[1].id,
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
    createdBy: STORY_USERS[0].id,
    updatedBy: STORY_USERS[1].id,
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
    createdBy: STORY_USERS[1].id,
    updatedBy: STORY_USERS[1].id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  },
];
