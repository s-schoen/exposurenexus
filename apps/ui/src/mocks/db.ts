import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

import {
  SEED_ASSETS,
  SEED_ASSETS_WITH_CUSTOM_FIELDS,
  SEED_AUTH_SESSION,
  SEED_CUSTOM_FIELDS,
  SEED_FINDINGS,
  SEED_OBSERVATIONS,
  SEED_ROLES,
  SEED_USERS,
  SEED_VULNERABILITIES,
} from "@/mocks/fixtures/seed.ts";

import type { AuthSessionDataReply } from "@exposurenexus/contracts/api";
import type { Asset, AssetWithCustomFields } from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  AssetCustomFieldValueLiteral,
} from "@exposurenexus/contracts/model/asset-custom-field";
import type { Finding, FindingStatistics } from "@exposurenexus/contracts/model/finding";
import type { Observation } from "@exposurenexus/contracts/model/observation";
import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";

export const MOCK_SCENARIOS = ["default", "empty", "loggedOut"] as const;

/**
 * - `default`: seed data, signed in as the seeded admin.
 * - `empty`: only users and roles, signed in as the seeded admin.
 * - `loggedOut`: seed data, no session.
 */
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export function isMockScenario(value: unknown): value is MockScenario {
  return MOCK_SCENARIOS.includes(value as MockScenario);
}

/** A finding without the fields the API derives from links and observations. */
export type FindingRecord = Omit<
  Finding,
  "vulnerabilities" | "observationCount" | "firstSeen" | "lastSeen"
> & { vulnerabilityIds: Array<string> };

export class Collection<T extends { id: string }> {
  readonly #items = new Map<string, T>();

  all(): Array<T> {
    return [...this.#items.values()];
  }

  get(id: string): T | undefined {
    return this.#items.get(id);
  }

  insert(...items: Array<T>): void {
    for (const item of items) {
      this.#items.set(item.id, item);
    }
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const current = this.#items.get(id);
    if (!current) {
      return undefined;
    }
    const next = { ...current, ...patch, id };
    this.#items.set(id, next);
    return next;
  }

  remove(id: string): T | undefined {
    const current = this.#items.get(id);
    this.#items.delete(id);
    return current;
  }

  clear(): void {
    this.#items.clear();
  }
}

export interface MockDb {
  users: Collection<UserProfile>;
  roles: Collection<Role>;
  vulnerabilities: Collection<VulnerabilityCatalog>;
  assets: Collection<Asset>;
  customFields: Collection<AssetCustomFieldDefinition>;
  /** assetId → fieldId → per-asset value; `undefined` means the definition default applies. */
  customFieldAssignments: Map<string, Map<string, AssetCustomFieldValueLiteral | undefined>>;
  findings: Collection<FindingRecord>;
  observations: Collection<Observation>;
  session: AuthSessionDataReply | null;
  reset: (scenario?: MockScenario) => void;
}

export function createMockDb(scenario: MockScenario = "default"): MockDb {
  const db: MockDb = {
    users: new Collection(),
    roles: new Collection(),
    vulnerabilities: new Collection(),
    assets: new Collection(),
    customFields: new Collection(),
    customFieldAssignments: new Map(),
    findings: new Collection(),
    observations: new Collection(),
    session: null,
    reset(nextScenario = "default") {
      for (const collection of [
        db.users,
        db.roles,
        db.vulnerabilities,
        db.assets,
        db.customFields,
        db.findings,
        db.observations,
      ]) {
        collection.clear();
      }
      db.customFieldAssignments.clear();
      seed(db, nextScenario);
    },
  };

  db.reset(scenario);
  return db;
}

function seed(db: MockDb, scenario: MockScenario): void {
  db.users.insert(...structuredClone(SEED_USERS));
  db.roles.insert(...structuredClone(SEED_ROLES));
  db.session = scenario === "loggedOut" ? null : structuredClone(SEED_AUTH_SESSION);

  if (scenario === "empty") {
    return;
  }

  db.vulnerabilities.insert(...structuredClone(SEED_VULNERABILITIES));
  db.assets.insert(...structuredClone(SEED_ASSETS));
  db.customFields.insert(...structuredClone(SEED_CUSTOM_FIELDS));
  for (const asset of SEED_ASSETS_WITH_CUSTOM_FIELDS) {
    db.customFieldAssignments.set(
      asset.id,
      new Map(
        asset.customFields.map((field) => [
          field.fieldId,
          field.source === AssetCustomFieldValueSource.Asset ? field.value : undefined,
        ]),
      ),
    );
  }
  db.findings.insert(...structuredClone(SEED_FINDINGS).map(toFindingRecord));
  db.observations.insert(...structuredClone(SEED_OBSERVATIONS));
}

export function toFindingRecord(finding: Finding): FindingRecord {
  const { vulnerabilities, observationCount: _, firstSeen: __, lastSeen: ___, ...record } = finding;
  return { ...record, vulnerabilityIds: vulnerabilities.map((vulnerability) => vulnerability.id) };
}

export function projectFinding(db: MockDb, record: FindingRecord): Finding {
  const { vulnerabilityIds, ...finding } = record;
  const observedAt = db.observations
    .all()
    .filter((observation) => observation.findingId === record.id)
    .map((observation) => observation.observedAt.getTime());

  return {
    ...finding,
    vulnerabilities: vulnerabilityIds.flatMap((id) => db.vulnerabilities.get(id) ?? []),
    observationCount: observedAt.length,
    firstSeen: observedAt.length > 0 ? new Date(Math.min(...observedAt)) : null,
    lastSeen: observedAt.length > 0 ? new Date(Math.max(...observedAt)) : null,
  };
}

export function computeFindingStatistics(db: MockDb): FindingStatistics {
  const findings = db.findings.all();
  const countBy = <K extends string>(keys: Array<K>, pick: (finding: FindingRecord) => string) =>
    Object.fromEntries(
      keys.map((key) => [key, findings.filter((finding) => pick(finding) === key).length]),
    ) as Record<K, number>;
  const assets: Record<string, number> = {};
  for (const finding of findings) {
    assets[finding.assetId] = (assets[finding.assetId] ?? 0) + 1;
  }

  return {
    total: findings.length,
    status: countBy(Object.values(FindingStatus), (finding) => finding.status),
    severity: countBy(Object.values(VulnerabilitySeverity), (finding) => finding.severity),
    assets,
  };
}

/** Mirrors the API projection: per-asset value, else the definition default, else empty. */
export function toCustomFieldValue(
  definition: AssetCustomFieldDefinition,
  override: AssetCustomFieldValueLiteral | undefined,
): AssetCustomFieldValue {
  const value = override !== undefined ? override : definition.defaultValue;
  const source =
    override !== undefined
      ? AssetCustomFieldValueSource.Asset
      : definition.defaultValue !== null
        ? AssetCustomFieldValueSource.Default
        : AssetCustomFieldValueSource.Empty;
  const base = { fieldId: definition.id, key: definition.key, name: definition.name, source };

  switch (definition.type) {
    case AssetCustomFieldType.Text:
      return { ...base, type: definition.type, value: value as string | null };
    case AssetCustomFieldType.Number:
      return { ...base, type: definition.type, value: value as number | null };
    case AssetCustomFieldType.Select:
      return {
        ...base,
        type: definition.type,
        value: value as string | null,
        options: definition.options,
      };
  }
}

export function listAssetCustomFieldValues(
  db: MockDb,
  assetId: string,
): Array<AssetCustomFieldValue> {
  const assignments = db.customFieldAssignments.get(assetId) ?? new Map();
  return db.customFields
    .all()
    .filter((definition) => assignments.has(definition.id))
    .map((definition) => toCustomFieldValue(definition, assignments.get(definition.id)));
}

export function projectAssetWithCustomFields(db: MockDb, asset: Asset): AssetWithCustomFields {
  return { ...asset, customFields: listAssetCustomFieldValues(db, asset.id) };
}
