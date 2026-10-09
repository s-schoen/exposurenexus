import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { ObservationSource } from "@exposurenexus/contracts/model/observation";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";

import {
  DEFAULT_ACTOR_ID,
  fixtureDate,
  fixtureId,
  nextFixtureSequence,
} from "@/mocks/fixtures/ids.ts";

import type { AuthSessionDataReply } from "@exposurenexus/contracts/api";
import type {
  Asset,
  AssetIdentifierRecord,
  AssetWithCustomFields,
} from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldOption,
} from "@exposurenexus/contracts/model/asset-custom-field";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { Observation } from "@exposurenexus/contracts/model/observation";
import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";

// Builders return contract-valid records with deterministic ids, names and dates.
// Pass relations explicitly, e.g. `buildFinding({ assetId: asset.id })`; defaults
// point at ids that exist in no collection.

const auditFields = () => ({
  createdAt: fixtureDate(0),
  updatedAt: fixtureDate(1),
  createdBy: DEFAULT_ACTOR_ID,
  updatedBy: DEFAULT_ACTOR_ID,
});

export function buildUser(overrides: Partial<UserProfile> = {}): UserProfile {
  const n = nextFixtureSequence("user");
  return {
    id: fixtureId("user", n),
    username: `user${n}`,
    displayName: `User ${n}`,
    email: `user${n}@example.com`,
    enabled: true,
    roleIds: [],
    ...overrides,
  };
}

export function buildRole(overrides: Partial<Role> = {}): Role {
  const n = nextFixtureSequence("role");
  return {
    id: fixtureId("role", n),
    name: `role-${n}`,
    permissions: [],
    ...overrides,
  };
}

export function buildAuthSession(
  user: UserProfile,
  overrides: Partial<AuthSessionDataReply["session"]> = {},
): AuthSessionDataReply {
  const n = nextFixtureSequence("session");
  return {
    user,
    session: {
      id: fixtureId("session", n),
      userId: user.id,
      sourceIp: "203.0.113.10",
      userAgent: "ExposureNexus mock",
      createdAt: fixtureDate(0),
      expiresAt: fixtureDate(1),
      ...overrides,
    },
  };
}

export function buildVulnerability(
  overrides: Partial<VulnerabilityCatalog> = {},
): VulnerabilityCatalog {
  const n = nextFixtureSequence("vulnerability");
  return {
    id: fixtureId("vulnerability", n),
    type: VulnerabilityType.Cve,
    identifier: `CVE-2026-${n.toString().padStart(4, "0")}`,
    title: `Vulnerability ${n}`,
    description: null,
    severity: VulnerabilitySeverity.Medium,
    metadata: null,
    ...auditFields(),
    ...overrides,
  };
}

export function buildAssetIdentifier(
  overrides: Partial<AssetIdentifierRecord> = {},
): AssetIdentifierRecord {
  const n = nextFixtureSequence("assetIdentifier");
  return {
    id: fixtureId("assetIdentifier", n),
    type: AssetIdentifierType.DnsName,
    namespace: null,
    value: `host-${n}.example.com`,
    ...overrides,
  };
}

export function buildAsset(overrides: Partial<Asset> = {}): Asset {
  const n = nextFixtureSequence("asset");
  return {
    id: fixtureId("asset", n),
    displayName: `asset-${n}`,
    type: AssetType.Host,
    environment: AssetEnvironment.Production,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: null,
    identifiers: [],
    ...auditFields(),
    ...overrides,
  };
}

export function buildAssetWithCustomFields(
  overrides: Partial<AssetWithCustomFields> = {},
): AssetWithCustomFields {
  const { customFields = [], ...asset } = overrides;
  return { ...buildAsset(asset), customFields };
}

export function buildCustomFieldOption(
  fieldId: string,
  overrides: Partial<AssetCustomFieldOption> = {},
): AssetCustomFieldOption {
  const n = nextFixtureSequence("customFieldOption");
  return {
    id: fixtureId("customFieldOption", n),
    fieldId,
    value: `option_${n}`,
    label: `Option ${n}`,
    ...overrides,
  };
}

/** Text field by default; pass `type`, `defaultValue` and (for select) `options` together. */
export function buildCustomFieldDefinition(
  overrides: Partial<AssetCustomFieldDefinition> = {},
): AssetCustomFieldDefinition {
  const n = nextFixtureSequence("customField");
  return {
    id: fixtureId("customField", n),
    key: `field_${n}`,
    name: `Field ${n}`,
    required: false,
    type: AssetCustomFieldType.Text,
    defaultValue: null,
    ...overrides,
  } as AssetCustomFieldDefinition;
}

export function buildFinding(overrides: Partial<Finding> = {}): Finding {
  const n = nextFixtureSequence("finding");
  return {
    id: fixtureId("finding", n),
    assetId: fixtureId("asset", 0),
    title: `Finding ${n}`,
    severity: VulnerabilitySeverity.Medium,
    status: FindingStatus.Active,
    assigneeId: null,
    dueDate: null,
    mitigation: null,
    weakness: { identifiers: {} },
    affectedResource: { type: AffectedResourceType.Unspecified },
    vulnerabilities: [],
    observationCount: 0,
    firstSeen: null,
    lastSeen: null,
    ...auditFields(),
    ...overrides,
  };
}

/** Manual observation by default; scanner sources also need an `ingestionId`. */
export function buildObservation(overrides: Partial<Observation> = {}): Observation {
  const n = nextFixtureSequence("observation");
  return {
    id: fixtureId("observation", n),
    findingId: fixtureId("finding", 0),
    title: `Observation ${n}`,
    description: null,
    evidence: null,
    remediation: null,
    severity: VulnerabilitySeverity.Medium,
    weakness: { identifiers: {} },
    affectedResource: { type: AffectedResourceType.Unspecified },
    fingerprints: {},
    source: ObservationSource.Manual,
    ingestionId: null,
    observedAt: fixtureDate(0),
    ...auditFields(),
    ...overrides,
  } as Observation;
}
