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
import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAssetLifecycle } from "@/features/assets/hooks/use-asset-lifecycle.ts";
import {
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
  createListAssetsQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
} from "@/features/assets/queries/assets.ts";
import { useAssetCustomFieldDefinitionLifecycle } from "@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts";
import {
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
} from "@/features/custom-fields/queries/definitions.ts";
import { useFindingLifecycle } from "@/features/findings/hooks/use-finding-lifecycle.ts";
import { useObservationLifecycle } from "@/features/findings/hooks/use-observation-lifecycle.ts";
import {
  createFindingByIDQueryOptions,
  createFindingObservationsQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
} from "@/features/findings/queries/findings.ts";
import { useRoleLifecycle } from "@/features/roles/hooks/use-role-lifecycle.ts";
import {
  createListRolesQueryOptions,
  createRoleByIDQueryOptions,
} from "@/features/roles/queries/roles.ts";
import { useUserLifecycle } from "@/features/users/hooks/use-user-lifecycle.ts";
import {
  createListUsersQueryOptions,
  createUserByIDQueryOptions,
} from "@/features/users/queries/users.ts";
import { useVulnerabilityLifecycle } from "@/features/vulnerabilities/hooks/use-vulnerability-lifecycle.ts";
import {
  createListVulnerabilitiesQueryOptions,
  createVulnerabilityByIDQueryOptions,
} from "@/features/vulnerabilities/queries/vulnerabilities.ts";
import {
  ASSET_CUSTOM_FIELD_FIXTURES,
  ROLE_FIXTURES,
  STORY_ASSETS,
  STORY_ASSETS_WITH_CUSTOM_FIELDS,
  STORY_USERS,
  STORY_VULNERABILITIES,
} from "@/test/fixtures.ts";

import type {
  Asset,
  AssetIdentifierRecord,
  CreateAsset,
  CreateAssetIdentifier,
  UpdateAsset,
  UpdateAssetIdentifier,
} from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldValue,
} from "@exposurenexus/contracts/model/asset-custom-field";
import type {
  CreateManualFinding,
  Finding,
  FindingStatistics,
  UpdateFinding,
} from "@exposurenexus/contracts/model/finding";
import type {
  ManualObservationInput,
  Observation,
  UpdateObservation,
} from "@exposurenexus/contracts/model/observation";
import type { CreateRole, Role, UpdateRole } from "@exposurenexus/contracts/model/rbac";
import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile,
} from "@exposurenexus/contracts/model/user";
import type {
  VulnerabilityCatalog,
  VulnerabilityInput,
} from "@exposurenexus/contracts/model/vulnerability";
import type { FetchQueryOptions, QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

const fetchMock = vi.fn<typeof fetch>();

const asset = STORY_ASSETS[0];
const user = STORY_USERS[0];
const role = ROLE_FIXTURES[1];
const vulnerability = STORY_VULNERABILITIES[0];
const textField = ASSET_CUSTOM_FIELD_FIXTURES[0];
const numberField = ASSET_CUSTOM_FIELD_FIXTURES[1];
const selectField = ASSET_CUSTOM_FIELD_FIXTURES[2];

const categoryValue: AssetCustomFieldValue = {
  fieldId: textField.id,
  key: textField.key,
  name: textField.name,
  source: AssetCustomFieldValueSource.Asset,
  type: AssetCustomFieldType.Text,
  value: "internet-facing",
};

const priorityValue: AssetCustomFieldValue = {
  fieldId: numberField.id,
  key: numberField.key,
  name: numberField.name,
  source: AssetCustomFieldValueSource.Asset,
  type: AssetCustomFieldType.Number,
  value: 2,
};

const createdAsset: Asset = {
  ...asset,
  id: "be5b1b7e-10ab-47d5-83b3-1db8e3a3d7a5",
  displayName: "new-web",
  identifiers: [
    {
      id: "f4b28e50-f8e1-42f8-a610-50b7a7f96d9d",
      type: AssetIdentifierType.DnsName,
      namespace: "public",
      value: "new.example.com",
    },
  ],
};

const updatedAsset: Asset = {
  ...asset,
  displayName: "updated-web",
  ownerId: user.id,
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
};

const createIdentifier: CreateAssetIdentifier = {
  type: AssetIdentifierType.DnsName,
  namespace: "public",
  value: "new.example.com",
};

const addedIdentifier: AssetIdentifierRecord = {
  id: "f4b28e50-f8e1-42f8-a610-50b7a7f96d9d",
  type: AssetIdentifierType.DnsName,
  namespace: "public",
  value: "new.example.com",
};

const updateIdentifier: UpdateAssetIdentifier = {
  type: AssetIdentifierType.DnsName,
  namespace: "private",
  value: "internal.example.com",
};

const updatedIdentifier: AssetIdentifierRecord = {
  ...addedIdentifier,
  namespace: "private",
  value: "internal.example.com",
};

const createAssetPayload: CreateAsset = {
  displayName: "new-web",
  type: AssetType.Host,
  environment: AssetEnvironment.Production,
  lifecycleState: AssetLifecycleState.Active,
  ownerId: user.id,
  identifiers: [createIdentifier],
};

const updateAssetPayload: UpdateAsset = {
  displayName: "updated-web",
  ownerId: user.id,
};

const updateValues: Array<UpdateAssetCustomFieldValue> = [
  { fieldId: textField.id, value: "internal" },
];
const resetValues: Array<UpdateAssetCustomFieldValue> = [{ fieldId: textField.id, value: null }];

function createSelectDefinition(id: string, name: string): AssetCustomFieldDefinition {
  return {
    id,
    key: "environment_tier",
    name,
    required: true,
    type: AssetCustomFieldType.Select,
    defaultValue: "production",
    options: [
      {
        id: "a2b4c6d8-e0f2-4a6b-8c0d-2e4f6a8b0c1d",
        fieldId: id,
        value: "production",
        label: "Production",
      },
      {
        id: "b3c5d7e9-f1a3-4b7c-9d1e-3f5a7b9d1e2f",
        fieldId: id,
        value: "staging",
        label: "Staging",
      },
    ],
  };
}

const createdDefinition = createSelectDefinition(
  "d8e2f6a0-4b8c-4d1e-9f3a-5c7e9b1d3f5a",
  "Environment tier",
);
const updatedDefinition: AssetCustomFieldDefinition = {
  ...createdDefinition,
  name: "Deployment tier",
};
const createDefinitionPayload: CreateAssetCustomFieldDefinition = {
  key: "environment_tier",
  name: "Environment tier",
  required: true,
  type: AssetCustomFieldType.Select,
  defaultValue: "production",
  options: [
    { value: "production", label: "Production" },
    { value: "staging", label: "Staging" },
  ],
};
const updateDefinitionPayload: UpdateAssetCustomFieldDefinition = {
  ...createDefinitionPayload,
  defaultValue: createDefinitionPayload.defaultValue ?? null,
  name: "Deployment tier",
};

const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
const unrelatedFindingId = "f83f9298-2271-4b13-84fe-13724989243b";
const targetFindingId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";

function createFindingFixture(overrides: Partial<Finding> = {}): Finding {
  return {
    id: findingId,
    assetId: asset.id,
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    assigneeId: user.id,
    dueDate: new Date("2026-05-06T00:00:00.000Z"),
    mitigation: "Restrict access to internal networks",
    weakness: { identifiers: { cwe: ["CWE-200"] } },
    affectedResource: {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "web-01.example.com",
      path: "/admin",
    },
    vulnerabilities: [],
    observationCount: 1,
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-03T00:00:00.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    ...overrides,
  };
}

const finding = createFindingFixture();
const unrelatedFinding = createFindingFixture({
  id: unrelatedFindingId,
  title: "Unrelated finding",
});
const targetFinding = createFindingFixture({ id: targetFindingId, title: "Target finding" });
const createdFinding = createFindingFixture({
  id: "a1b2c3d4-e5f6-4789-a012-b345c678d901",
  title: "Created finding",
  vulnerabilities: [vulnerability],
});
const correctedFinding = createFindingFixture({
  title: "Corrected finding",
  status: FindingStatus.Confirmed,
  assigneeId: null,
  dueDate: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-04T00:00:00.000Z"),
});
const linkedFinding = createFindingFixture({
  vulnerabilities: [vulnerability],
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
});
const unlinkedFinding = createFindingFixture({
  updatedAt: new Date("2026-01-06T00:00:00.000Z"),
});

const findingUpdate: UpdateFinding = {
  title: "Corrected finding",
  status: FindingStatus.Confirmed,
  assigneeId: null,
  dueDate: new Date("2026-06-01T00:00:00.000Z"),
};

const findingCreatePayload: CreateManualFinding = {
  assetId: asset.id,
  title: "Created finding",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: "Restrict access to internal networks",
  weakness: { identifiers: { cwe: ["CWE-200"] } },
  affectedResource: {
    type: AffectedResourceType.WebEndpoint,
    scheme: "https",
    host: "web-01.example.com",
    path: "/admin",
  },
  vulnerabilityIds: [vulnerability.id],
  observation: {
    evidence: "GET /admin returned 200",
    affectedResource: {
      type: AffectedResourceType.Package,
      ecosystem: "npm",
      name: "example-package",
      version: "1.2.3",
    },
    observedAt: new Date("2026-01-04T00:00:00.000Z"),
  },
};

const observationId = "f39a0c31-33b9-4f10-a128-35158dee4a26";
const observation: Observation = {
  id: observationId,
  findingId,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Observed admin endpoint",
  description: null,
  evidence: "GET /admin returned 200",
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: { cwe: ["CWE-200"] } },
  affectedResource: {
    type: AffectedResourceType.Package,
    ecosystem: "npm",
    name: "example-package",
    version: "1.2.3",
  },
  observedAt: new Date("2026-01-03T00:00:00.000Z"),
  createdBy: user.id,
  updatedBy: user.id,
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};
const updatedObservation: Observation = {
  ...observation,
  title: "Corrected observation",
  observedAt: new Date("2026-01-04T00:00:00.000Z"),
  updatedAt: new Date("2026-01-04T00:00:00.000Z"),
};
const movedObservation: Observation = {
  ...updatedObservation,
  findingId: targetFindingId,
};

const observationCreatePayload: ManualObservationInput = {
  title: "Observed admin endpoint",
  evidence: "GET /admin returned 200",
  affectedResource: {
    type: AffectedResourceType.Package,
    ecosystem: "npm",
    name: "example-package",
    version: "1.2.3",
  },
  observedAt: new Date("2026-01-03T00:00:00.000Z"),
};
const observationUpdatePayload: UpdateObservation = {
  title: "Corrected observation",
  description: null,
  evidence: "GET /admin returned 401",
  remediation: null,
  severity: VulnerabilitySeverity.Medium,
  weakness: { identifiers: { cwe: ["CWE-89"] } },
  affectedResource: {
    type: AffectedResourceType.Package,
    ecosystem: "npm",
    name: "example-package",
    version: "1.2.4",
  },
  observedAt: new Date("2026-01-04T00:00:00.000Z"),
};

const findingStats: FindingStatistics = {
  total: 2,
  status: {
    [FindingStatus.Active]: 1,
    [FindingStatus.Inactive]: 0,
    [FindingStatus.Confirmed]: 1,
    [FindingStatus.FalsePositive]: 0,
    [FindingStatus.RiskAccepted]: 0,
    [FindingStatus.Duplicate]: 0,
    [FindingStatus.OutOfScope]: 0,
    [FindingStatus.Mitigated]: 0,
  },
  severity: {
    [VulnerabilitySeverity.Info]: 0,
    [VulnerabilitySeverity.Low]: 0,
    [VulnerabilitySeverity.Medium]: 0,
    [VulnerabilitySeverity.High]: 1,
    [VulnerabilitySeverity.Critical]: 1,
  },
  assets: { [asset.id]: 2 },
};

const createdRole: Role = {
  id: "c1d2e3f4-a5b6-4789-8012-d345e678f901",
  name: "security-analyst",
  permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
};
const updatedRole: Role = {
  ...createdRole,
  name: "security-editor",
  permissions: [
    { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
    { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
  ],
};
const createRolePayload: CreateRole = {
  name: createdRole.name,
  permissions: createdRole.permissions,
};
const updateRolePayload: UpdateRole = {
  name: updatedRole.name,
  permissions: updatedRole.permissions,
};

const createdUser: UserProfile = {
  ...user,
  id: "d1e2f3a4-b5c6-4789-8012-e345f678a901",
  username: "new-user",
  displayName: "New User",
};
const updatedUser: UserProfile = {
  ...createdUser,
  displayName: "Updated User",
  email: "updated@example.com",
  enabled: false,
  roleIds: [role.id],
};
const createUserPayload: CreateUserProfile = {
  username: createdUser.username,
  displayName: createdUser.displayName,
  email: createdUser.email,
  enabled: true,
  password: "correct horse battery staple",
  roleIds: [role.id],
};
const updateUserPayload: UpdateUserProfile = {
  displayName: updatedUser.displayName,
  email: updatedUser.email,
  enabled: updatedUser.enabled,
  roleIds: updatedUser.roleIds,
};

const createdVulnerability: VulnerabilityCatalog = {
  ...vulnerability,
  id: "e1f2a3b4-c5d6-4789-8012-f345a678b901",
  type: VulnerabilityType.Custom,
  identifier: "new-issue",
  title: "New issue",
  description: "A newly created catalog entry",
  metadata: { source: "integration-test" },
};
const updatedVulnerability: VulnerabilityCatalog = {
  ...createdVulnerability,
  identifier: "updated-issue",
  title: "Updated issue",
  severity: VulnerabilitySeverity.Critical,
  description: null,
  metadata: null,
};
const createVulnerabilityPayload: VulnerabilityInput = {
  type: VulnerabilityType.Custom,
  identifier: "new-issue",
  title: "New issue",
  severity: VulnerabilitySeverity.High,
  description: "A newly created catalog entry",
  metadata: { source: "integration-test" },
};
const updateVulnerabilityPayload: VulnerabilityInput = {
  type: VulnerabilityType.Custom,
  identifier: "updated-issue",
  title: "Updated issue",
  severity: VulnerabilitySeverity.Critical,
  description: null,
  metadata: null,
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function arrayReply(items: Array<unknown>): Response {
  return jsonResponse({ data: { items } });
}

function objectReply(data: unknown): Response {
  return jsonResponse({ data });
}

function serializedBody(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function expectRequest(index: number, path: string, method: string, body?: unknown) {
  const [url, init] = fetchMock.mock.calls[index] ?? [];
  expect(url).toBe(path);
  expect(init).toEqual(
    expect.objectContaining({
      credentials: "include",
      method,
    }),
  );

  if (body === undefined) {
    expect(init?.body).toBeUndefined();
  } else {
    expect(JSON.parse(init?.body as string)).toEqual(body);
  }
}

function expectInvalidated(queryClient: QueryClient, queryKey: QueryKey) {
  expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

function renderWithQueryClient<TResult>(hook: () => TResult) {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    queryClient,
    ...renderHook(hook, { wrapper }),
  };
}

async function assertQuery<TData>(
  queryClient: QueryClient,
  options: FetchQueryOptions<TData, Error, TData, Array<string>>,
  reply: Response,
  path: string,
  expected: TData,
) {
  const requestIndex = fetchMock.mock.calls.length;
  fetchMock.mockResolvedValueOnce(reply);

  const result = await queryClient.fetchQuery(options);

  expect(result).toEqual(expected);
  expect(queryClient.getQueryData(options.queryKey)).toEqual(expected);
  expectRequest(requestIndex, path, "GET");
}

beforeEach(() => {
  fetchMock.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("real resource mutation wiring", () => {
  it("executes every asset mutation through the real lifecycle and preserves cache scope", async () => {
    const { queryClient, result } = renderWithQueryClient(useAssetLifecycle);
    const listOptions = createListAssetsQueryOptions();
    const filteredListOptions = createListAssetsQueryOptions({ filter: "web" });
    const enrichedListOptions = createListAssetsWithCustomFieldsQueryOptions({
      assetEnvironment: [AssetEnvironment.Production],
    });
    const detailOptions = createAssetByIDQueryOptions(asset.id);
    const createdDetailOptions = createAssetByIDQueryOptions(createdAsset.id);
    const valuesOptions = createAssetCustomFieldValuesQueryOptions(asset.id);
    const availableOptions = createAvailableAssetCustomFieldDefinitionsQueryOptions(asset.id);
    const unrelatedKey = ["roles", "unrelated"];

    queryClient.setQueryData(listOptions.queryKey, [asset]);
    queryClient.setQueryData(filteredListOptions.queryKey, [asset]);
    queryClient.setQueryData(enrichedListOptions.queryKey, [
      { ...asset, customFields: STORY_ASSETS_WITH_CUSTOM_FIELDS[0].customFields },
    ]);
    queryClient.setQueryData(detailOptions.queryKey, asset);
    queryClient.setQueryData(createdDetailOptions.queryKey, createdAsset);
    queryClient.setQueryData(valuesOptions.queryKey, [categoryValue]);
    queryClient.setQueryData(availableOptions.queryKey, [selectField]);
    queryClient.setQueryData(unrelatedKey, [role]);

    fetchMock
      .mockResolvedValueOnce(objectReply(createdAsset))
      .mockResolvedValueOnce(objectReply(updatedAsset))
      .mockResolvedValueOnce(objectReply(addedIdentifier))
      .mockResolvedValueOnce(objectReply(updatedIdentifier))
      .mockResolvedValueOnce(objectReply(addedIdentifier))
      .mockResolvedValueOnce(arrayReply([{ ...categoryValue, value: "internal" }]))
      .mockResolvedValueOnce(arrayReply([]))
      .mockResolvedValueOnce(arrayReply([categoryValue, priorityValue]))
      .mockResolvedValueOnce(arrayReply([categoryValue]))
      .mockResolvedValueOnce(objectReply(updatedAsset));

    await act(async () => {
      await expect(result.current.createAsset(createAssetPayload)).resolves.toEqual(createdAsset);
    });
    expectRequest(0, "/api/assets", "POST", serializedBody(createAssetPayload));
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, filteredListOptions.queryKey);
    expectInvalidated(queryClient, enrichedListOptions.queryKey);
    expectInvalidated(queryClient, createdDetailOptions.queryKey);

    await act(async () => {
      await expect(result.current.updateAsset(asset.id, updateAssetPayload)).resolves.toEqual(
        updatedAsset,
      );
    });
    expectRequest(1, `/api/assets/${asset.id}`, "PATCH", serializedBody(updateAssetPayload));
    expect(queryClient.getQueryData(detailOptions.queryKey)).toEqual(updatedAsset);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expectInvalidated(queryClient, listOptions.queryKey);

    queryClient.setQueryData(detailOptions.queryKey, asset);
    await act(async () => {
      await expect(result.current.addAssetIdentifier(asset.id, createIdentifier)).resolves.toEqual(
        addedIdentifier,
      );
    });
    expectRequest(
      2,
      `/api/assets/${asset.id}/identifiers`,
      "POST",
      serializedBody(createIdentifier),
    );
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(detailOptions.queryKey, asset);
    await act(async () => {
      await expect(
        result.current.updateAssetIdentifier(asset.id, addedIdentifier.id, updateIdentifier),
      ).resolves.toEqual(updatedIdentifier);
    });
    expectRequest(
      3,
      `/api/assets/${asset.id}/identifiers/${addedIdentifier.id}`,
      "PUT",
      serializedBody(updateIdentifier),
    );
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(detailOptions.queryKey, asset);
    await act(async () => {
      await expect(
        result.current.deleteAssetIdentifier(asset.id, addedIdentifier.id),
      ).resolves.toEqual(addedIdentifier);
    });
    expectRequest(4, `/api/assets/${asset.id}/identifiers/${addedIdentifier.id}`, "DELETE");
    expectInvalidated(queryClient, detailOptions.queryKey);

    const updatedValues: Array<AssetCustomFieldValue> = [
      {
        ...categoryValue,
        value: "internal",
      },
    ];
    queryClient.setQueryData(valuesOptions.queryKey, [categoryValue]);
    await act(async () => {
      await expect(
        result.current.updateAssetCustomFieldValues(asset.id, updateValues),
      ).resolves.toEqual(updatedValues);
    });
    expectRequest(
      5,
      `/api/assets/${asset.id}/custom-fields`,
      "PUT",
      serializedBody({ values: updateValues }),
    );
    expect(queryClient.getQueryData(valuesOptions.queryKey)).toEqual(updatedValues);
    expectInvalidated(queryClient, valuesOptions.queryKey);

    queryClient.setQueryData(valuesOptions.queryKey, updatedValues);
    await act(async () => {
      await expect(
        result.current.resetAssetCustomFieldValues(asset.id, resetValues),
      ).resolves.toEqual([]);
    });
    expectRequest(
      6,
      `/api/assets/${asset.id}/custom-fields`,
      "PUT",
      serializedBody({ values: resetValues }),
    );
    expect(queryClient.getQueryData(valuesOptions.queryKey)).toEqual([]);
    expectInvalidated(queryClient, valuesOptions.queryKey);

    const assignedFieldIds = [textField.id, numberField.id];
    queryClient.setQueryData(valuesOptions.queryKey, []);
    await act(async () => {
      await expect(
        result.current.assignAssetCustomField(asset.id, assignedFieldIds),
      ).resolves.toEqual([categoryValue, priorityValue]);
    });
    expectRequest(
      7,
      `/api/assets/${asset.id}/custom-fields/associations`,
      "PUT",
      serializedBody({ fieldIds: assignedFieldIds }),
    );
    expect(queryClient.getQueryData(valuesOptions.queryKey)).toEqual([
      categoryValue,
      priorityValue,
    ]);
    expectInvalidated(queryClient, valuesOptions.queryKey);
    expectInvalidated(queryClient, availableOptions.queryKey);

    const remainingFieldIds = [textField.id];
    queryClient.setQueryData(valuesOptions.queryKey, [categoryValue, priorityValue]);
    await act(async () => {
      await expect(
        result.current.detachAssetCustomField(asset.id, remainingFieldIds),
      ).resolves.toEqual([categoryValue]);
    });
    expectRequest(
      8,
      `/api/assets/${asset.id}/custom-fields/associations`,
      "PUT",
      serializedBody({ fieldIds: remainingFieldIds }),
    );
    expect(queryClient.getQueryData(valuesOptions.queryKey)).toEqual([categoryValue]);
    expectInvalidated(queryClient, valuesOptions.queryKey);
    expectInvalidated(queryClient, availableOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [updatedAsset]);
    queryClient.setQueryData(detailOptions.queryKey, updatedAsset);
    await act(async () => {
      await expect(result.current.deleteAssets([updatedAsset])).resolves.toEqual({
        successful: [updatedAsset],
        failed: [],
      });
    });
    expectRequest(9, `/api/assets/${asset.id}`, "DELETE");
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, filteredListOptions.queryKey);
    expectInvalidated(queryClient, enrichedListOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expect(queryClient.getQueryData(unrelatedKey)).toEqual([role]);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("executes custom-field definition mutations with real transport and cache updates", async () => {
    const { queryClient, result } = renderWithQueryClient(useAssetCustomFieldDefinitionLifecycle);
    const listOptions = createListAssetCustomFieldDefinitionsQueryOptions();
    const detailOptions = createAssetCustomFieldDefinitionByIDQueryOptions(createdDefinition.id);
    const unrelatedKey = ["assets", asset.id];

    queryClient.setQueryData(listOptions.queryKey, [selectField]);
    queryClient.setQueryData(detailOptions.queryKey, createdDefinition);
    queryClient.setQueryData(unrelatedKey, asset);

    fetchMock
      .mockResolvedValueOnce(objectReply(createdDefinition))
      .mockResolvedValueOnce(objectReply(updatedDefinition))
      .mockResolvedValueOnce(objectReply(updatedDefinition));

    await act(async () => {
      await expect(result.current.createDefinition(createDefinitionPayload)).resolves.toEqual(
        createdDefinition,
      );
    });
    expectRequest(0, "/api/assets/custom-fields", "POST", serializedBody(createDefinitionPayload));
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [createdDefinition]);
    queryClient.setQueryData(detailOptions.queryKey, createdDefinition);
    await act(async () => {
      await expect(
        result.current.updateDefinition(createdDefinition.id, updateDefinitionPayload),
      ).resolves.toEqual(updatedDefinition);
    });
    expectRequest(
      1,
      `/api/assets/custom-fields/${createdDefinition.id}`,
      "PUT",
      serializedBody(updateDefinitionPayload),
    );
    expect(queryClient.getQueryData(detailOptions.queryKey)).toEqual(updatedDefinition);
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [updatedDefinition]);
    queryClient.setQueryData(detailOptions.queryKey, updatedDefinition);
    await act(async () => {
      await expect(result.current.deleteDefinitions([updatedDefinition])).resolves.toEqual({
        successful: [updatedDefinition],
        failed: [],
      });
    });
    expectRequest(2, `/api/assets/custom-fields/${createdDefinition.id}`, "DELETE");
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expect(queryClient.getQueryData(unrelatedKey)).toEqual(asset);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("executes finding, observation, and catalog-association mutations against real caches", async () => {
    const { queryClient, result } = renderWithQueryClient(useFindingLifecycle);
    const listOptions = createListFindingsQueryOptions();
    const detailOptions = createFindingByIDQueryOptions(finding.id);
    const statsOptions = createFindingStatsQueryOptions();
    const unrelatedKey = ["assets", asset.id];

    queryClient.setQueryData(listOptions.queryKey, [finding, unrelatedFinding]);
    queryClient.setQueryData(detailOptions.queryKey, finding);
    queryClient.setQueryData(statsOptions.queryKey, findingStats);
    queryClient.setQueryData(unrelatedKey, [asset]);

    fetchMock
      .mockResolvedValueOnce(objectReply(createdFinding))
      .mockResolvedValueOnce(objectReply(correctedFinding))
      .mockResolvedValueOnce(objectReply(linkedFinding))
      .mockResolvedValueOnce(objectReply(unlinkedFinding))
      .mockResolvedValueOnce(objectReply(unlinkedFinding));

    await act(async () => {
      await expect(result.current.createFinding(findingCreatePayload)).resolves.toEqual(
        createdFinding,
      );
    });
    expectRequest(0, "/api/findings", "POST", serializedBody(findingCreatePayload));
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, statsOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [finding, unrelatedFinding]);
    queryClient.setQueryData(detailOptions.queryKey, finding);
    queryClient.setQueryData(statsOptions.queryKey, findingStats);
    await act(async () => {
      await expect(result.current.correctFinding(finding.id, findingUpdate)).resolves.toEqual(
        correctedFinding,
      );
    });
    expectRequest(1, `/api/findings/${finding.id}`, "PUT", serializedBody(findingUpdate));
    expect(queryClient.getQueryData(detailOptions.queryKey)).toEqual(correctedFinding);
    expect(queryClient.getQueryData(listOptions.queryKey)).toEqual([
      correctedFinding,
      unrelatedFinding,
    ]);
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expectInvalidated(queryClient, statsOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [correctedFinding, unrelatedFinding]);
    queryClient.setQueryData(detailOptions.queryKey, correctedFinding);
    queryClient.setQueryData(statsOptions.queryKey, findingStats);
    await act(async () => {
      await expect(result.current.linkVulnerability(finding.id, vulnerability.id)).resolves.toEqual(
        linkedFinding,
      );
    });
    expectRequest(2, `/api/findings/${finding.id}/vulnerabilities/${vulnerability.id}`, "PUT");
    expect(queryClient.getQueryData(detailOptions.queryKey)).toEqual(linkedFinding);
    expect(queryClient.getQueryData(listOptions.queryKey)).toEqual([
      linkedFinding,
      unrelatedFinding,
    ]);
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [linkedFinding, unrelatedFinding]);
    queryClient.setQueryData(detailOptions.queryKey, linkedFinding);
    queryClient.setQueryData(statsOptions.queryKey, findingStats);
    await act(async () => {
      await expect(
        result.current.unlinkVulnerability(finding.id, vulnerability.id),
      ).resolves.toEqual(unlinkedFinding);
    });
    expectRequest(3, `/api/findings/${finding.id}/vulnerabilities/${vulnerability.id}`, "DELETE");
    expect(queryClient.getQueryData(detailOptions.queryKey)).toEqual(unlinkedFinding);
    expect(queryClient.getQueryData(listOptions.queryKey)).toEqual([
      unlinkedFinding,
      unrelatedFinding,
    ]);
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [unlinkedFinding, unrelatedFinding]);
    queryClient.setQueryData(detailOptions.queryKey, unlinkedFinding);
    queryClient.setQueryData(statsOptions.queryKey, findingStats);
    await act(async () => {
      await expect(result.current.deleteFindings([unlinkedFinding])).resolves.toEqual({
        successful: [unlinkedFinding],
        failed: [],
      });
    });
    expectRequest(4, `/api/findings/${finding.id}`, "DELETE");
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expectInvalidated(queryClient, statsOptions.queryKey);
    expect(queryClient.getQueryData(unrelatedKey)).toEqual([asset]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("executes nested observation mutations and invalidates both finding subtrees on move", async () => {
    const { queryClient, result } = renderWithQueryClient(useObservationLifecycle);
    const sourceObservations = createFindingObservationsQueryOptions(findingId);
    const sourceDetail = createFindingByIDQueryOptions(findingId);
    const targetObservations = createFindingObservationsQueryOptions(targetFindingId);
    const targetDetail = createFindingByIDQueryOptions(targetFindingId);
    const listOptions = createListFindingsQueryOptions();
    const statsOptions = createFindingStatsQueryOptions();
    const cacheEntries = [
      [sourceObservations.queryKey, [observation]],
      [sourceDetail.queryKey, finding],
      [targetObservations.queryKey, []],
      [targetDetail.queryKey, targetFinding],
      [listOptions.queryKey, [finding, targetFinding]],
      [statsOptions.queryKey, findingStats],
    ] as const;

    for (const [queryKey, data] of cacheEntries) {
      queryClient.setQueryData(queryKey, data);
    }

    fetchMock
      .mockResolvedValueOnce(objectReply(observation))
      .mockResolvedValueOnce(objectReply(updatedObservation))
      .mockResolvedValueOnce(objectReply(observation))
      .mockResolvedValueOnce(objectReply(movedObservation));

    await act(async () => {
      await expect(
        result.current.addObservation(findingId, observationCreatePayload),
      ).resolves.toEqual(observation);
    });
    expectRequest(
      0,
      `/api/findings/${findingId}/observations`,
      "POST",
      serializedBody(observationCreatePayload),
    );
    expectInvalidated(queryClient, sourceObservations.queryKey);
    expectInvalidated(queryClient, sourceDetail.queryKey);
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, statsOptions.queryKey);

    queryClient.setQueryData(sourceObservations.queryKey, [observation]);
    queryClient.setQueryData(sourceDetail.queryKey, finding);
    queryClient.setQueryData(listOptions.queryKey, [finding, targetFinding]);
    queryClient.setQueryData(statsOptions.queryKey, findingStats);
    await act(async () => {
      await expect(
        result.current.updateObservation(findingId, observationId, observationUpdatePayload),
      ).resolves.toEqual(updatedObservation);
    });
    expectRequest(
      1,
      `/api/findings/${findingId}/observations/${observationId}`,
      "PUT",
      serializedBody(observationUpdatePayload),
    );
    expectInvalidated(queryClient, sourceObservations.queryKey);
    expectInvalidated(queryClient, sourceDetail.queryKey);

    queryClient.setQueryData(sourceObservations.queryKey, [updatedObservation]);
    queryClient.setQueryData(sourceDetail.queryKey, finding);
    queryClient.setQueryData(listOptions.queryKey, [finding, targetFinding]);
    queryClient.setQueryData(statsOptions.queryKey, findingStats);
    await act(async () => {
      await expect(result.current.deleteObservation(findingId, observationId)).resolves.toEqual(
        observation,
      );
    });
    expectRequest(2, `/api/findings/${findingId}/observations/${observationId}`, "DELETE");
    expectInvalidated(queryClient, sourceObservations.queryKey);
    expectInvalidated(queryClient, sourceDetail.queryKey);

    for (const [queryKey, data] of cacheEntries) {
      queryClient.setQueryData(queryKey, data);
    }
    await act(async () => {
      await expect(
        result.current.moveObservation(findingId, observationId, targetFindingId),
      ).resolves.toEqual(movedObservation);
    });
    expectRequest(3, `/api/findings/${findingId}/observations/${observationId}/move`, "POST", {
      targetFindingId,
    });
    for (const queryKey of [
      sourceObservations.queryKey,
      sourceDetail.queryKey,
      targetObservations.queryKey,
      targetDetail.queryKey,
      listOptions.queryKey,
      statsOptions.queryKey,
    ]) {
      expectInvalidated(queryClient, queryKey);
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("executes role mutations and scopes invalidation to role reads", async () => {
    const { queryClient, result } = renderWithQueryClient(useRoleLifecycle);
    const listOptions = createListRolesQueryOptions();
    const detailOptions = createRoleByIDQueryOptions(createdRole.id);
    const unrelatedKey = ["users", user.id];

    queryClient.setQueryData(listOptions.queryKey, [role]);
    queryClient.setQueryData(detailOptions.queryKey, createdRole);
    queryClient.setQueryData(unrelatedKey, user);

    fetchMock
      .mockResolvedValueOnce(objectReply(createdRole))
      .mockResolvedValueOnce(objectReply(updatedRole))
      .mockResolvedValueOnce(objectReply(updatedRole));

    await act(async () => {
      await expect(result.current.createRole(createRolePayload)).resolves.toEqual(createdRole);
    });
    expectRequest(0, "/api/roles", "POST", serializedBody(createRolePayload));
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [createdRole]);
    queryClient.setQueryData(detailOptions.queryKey, createdRole);
    await act(async () => {
      await expect(result.current.updateRole(createdRole.id, updateRolePayload)).resolves.toEqual(
        updatedRole,
      );
    });
    expectRequest(1, `/api/roles/${createdRole.id}`, "PUT", serializedBody(updateRolePayload));
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [updatedRole]);
    queryClient.setQueryData(detailOptions.queryKey, updatedRole);
    await act(async () => {
      await expect(result.current.deleteRoles([updatedRole])).resolves.toEqual({
        successful: [updatedRole],
        failed: [],
      });
    });
    expectRequest(2, `/api/roles/${createdRole.id}`, "DELETE");
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expect(queryClient.getQueryData(unrelatedKey)).toEqual(user);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("executes user mutations and replaces the updated detail cache", async () => {
    const { queryClient, result } = renderWithQueryClient(useUserLifecycle);
    const listOptions = createListUsersQueryOptions();
    const detailOptions = createUserByIDQueryOptions(createdUser.id);
    const unrelatedKey = ["roles", role.id];

    queryClient.setQueryData(listOptions.queryKey, [user]);
    queryClient.setQueryData(detailOptions.queryKey, createdUser);
    queryClient.setQueryData(unrelatedKey, [role]);

    fetchMock
      .mockResolvedValueOnce(objectReply(createdUser))
      .mockResolvedValueOnce(objectReply(updatedUser));

    await act(async () => {
      await expect(result.current.createUser(createUserPayload)).resolves.toEqual(createdUser);
    });
    expectRequest(0, "/api/users", "POST", serializedBody(createUserPayload));
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [createdUser]);
    queryClient.setQueryData(detailOptions.queryKey, createdUser);
    await act(async () => {
      await expect(result.current.updateUser(createdUser.id, updateUserPayload)).resolves.toEqual(
        updatedUser,
      );
    });
    expectRequest(1, `/api/users/${createdUser.id}`, "PUT", serializedBody(updateUserPayload));
    expect(queryClient.getQueryData(detailOptions.queryKey)).toEqual(updatedUser);
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expect(queryClient.getQueryData(unrelatedKey)).toEqual([role]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("executes vulnerability mutations and invalidates embedded finding catalog data", async () => {
    const { queryClient, result } = renderWithQueryClient(useVulnerabilityLifecycle);
    const listOptions = createListVulnerabilitiesQueryOptions();
    const detailOptions = createVulnerabilityByIDQueryOptions(createdVulnerability.id);
    const taggedFindingOptions = createFindingByIDQueryOptions(finding.id);

    queryClient.setQueryData(listOptions.queryKey, [vulnerability]);
    queryClient.setQueryData(detailOptions.queryKey, createdVulnerability);
    queryClient.setQueryDefaults(taggedFindingOptions.queryKey, {
      meta: taggedFindingOptions.meta,
    });
    queryClient.setQueryData(taggedFindingOptions.queryKey, finding);

    fetchMock
      .mockResolvedValueOnce(objectReply(createdVulnerability))
      .mockResolvedValueOnce(objectReply(updatedVulnerability))
      .mockResolvedValueOnce(objectReply(updatedVulnerability));

    await act(async () => {
      await expect(result.current.createVulnerability(createVulnerabilityPayload)).resolves.toEqual(
        createdVulnerability,
      );
    });
    expectRequest(0, "/api/vulnerabilities", "POST", serializedBody(createVulnerabilityPayload));
    expectInvalidated(queryClient, listOptions.queryKey);
    expect(queryClient.getQueryState(detailOptions.queryKey)?.isInvalidated).toBe(false);

    queryClient.setQueryData(listOptions.queryKey, [createdVulnerability]);
    queryClient.setQueryData(detailOptions.queryKey, createdVulnerability);
    queryClient.setQueryData(taggedFindingOptions.queryKey, finding);
    await act(async () => {
      await expect(
        result.current.updateVulnerability(createdVulnerability.id, updateVulnerabilityPayload),
      ).resolves.toEqual(updatedVulnerability);
    });
    expectRequest(
      1,
      `/api/vulnerabilities/${createdVulnerability.id}`,
      "PUT",
      serializedBody(updateVulnerabilityPayload),
    );
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expectInvalidated(queryClient, taggedFindingOptions.queryKey);

    queryClient.setQueryData(listOptions.queryKey, [updatedVulnerability]);
    queryClient.setQueryData(detailOptions.queryKey, updatedVulnerability);
    queryClient.setQueryData(taggedFindingOptions.queryKey, finding);
    await act(async () => {
      await expect(result.current.deleteVulnerability(updatedVulnerability)).resolves.toEqual(
        updatedVulnerability,
      );
    });
    expectRequest(2, `/api/vulnerabilities/${createdVulnerability.id}`, "DELETE");
    expectInvalidated(queryClient, listOptions.queryKey);
    expectInvalidated(queryClient, detailOptions.queryKey);
    expectInvalidated(queryClient, taggedFindingOptions.queryKey);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("real query option wiring", () => {
  it("executes every query factory through fetchQuery and caches parsed data", async () => {
    const queryClient = createQueryClient();

    await assertQuery(
      queryClient,
      createListAssetsQueryOptions({
        filter: "  web-01  ",
        assetType: [AssetType.Host],
        assetOwnerId: [user.id],
      }),
      arrayReply([asset]),
      `/api/assets?filter=web-01&assetType=host&assetOwnerId=${user.id}`,
      [asset],
    );
    await assertQuery(
      queryClient,
      createListAssetsWithCustomFieldsQueryOptions({
        assetEnvironment: [AssetEnvironment.Staging],
      }),
      arrayReply([STORY_ASSETS_WITH_CUSTOM_FIELDS[0]]),
      "/api/assets?includeCustomFields=true&assetEnvironment=staging",
      [STORY_ASSETS_WITH_CUSTOM_FIELDS[0]],
    );
    await assertQuery(
      queryClient,
      createAssetByIDQueryOptions(asset.id),
      objectReply(asset),
      `/api/assets/${asset.id}`,
      asset,
    );
    await assertQuery(
      queryClient,
      createAssetCustomFieldValuesQueryOptions(asset.id),
      arrayReply([categoryValue]),
      `/api/assets/${asset.id}/custom-fields`,
      [categoryValue],
    );
    await assertQuery(
      queryClient,
      createAvailableAssetCustomFieldDefinitionsQueryOptions(asset.id),
      arrayReply([selectField]),
      `/api/assets/${asset.id}/custom-fields/available`,
      [selectField],
    );

    await assertQuery(
      queryClient,
      createListAssetCustomFieldDefinitionsQueryOptions(),
      arrayReply([textField, numberField, selectField]),
      "/api/assets/custom-fields",
      [textField, numberField, selectField],
    );
    await assertQuery(
      queryClient,
      createAssetCustomFieldDefinitionByIDQueryOptions(selectField.id),
      objectReply(selectField),
      `/api/assets/custom-fields/${selectField.id}`,
      selectField,
    );

    await assertQuery(
      queryClient,
      createListFindingsQueryOptions(),
      arrayReply([finding, unrelatedFinding]),
      "/api/findings",
      [finding, unrelatedFinding],
    );
    await assertQuery(
      queryClient,
      createFindingByIDQueryOptions(finding.id),
      objectReply(finding),
      `/api/findings/${finding.id}`,
      finding,
    );
    await assertQuery(
      queryClient,
      createFindingStatsQueryOptions(),
      objectReply(findingStats),
      "/api/findings/stats",
      findingStats,
    );
    await assertQuery(
      queryClient,
      createFindingObservationsQueryOptions(finding.id),
      arrayReply([observation]),
      `/api/findings/${finding.id}/observations`,
      [observation],
    );

    await assertQuery(
      queryClient,
      createListRolesQueryOptions(),
      arrayReply([role]),
      "/api/roles",
      [role],
    );
    await assertQuery(
      queryClient,
      createRoleByIDQueryOptions(role.id),
      objectReply(role),
      `/api/roles/${role.id}`,
      role,
    );

    await assertQuery(
      queryClient,
      createListUsersQueryOptions(),
      arrayReply([user]),
      "/api/users",
      [user],
    );
    await assertQuery(
      queryClient,
      createUserByIDQueryOptions(user.id),
      objectReply(user),
      `/api/users/${user.id}`,
      user,
    );

    await assertQuery(
      queryClient,
      createListVulnerabilitiesQueryOptions(),
      arrayReply([vulnerability]),
      "/api/vulnerabilities",
      [vulnerability],
    );
    await assertQuery(
      queryClient,
      createVulnerabilityByIDQueryOptions(vulnerability.id),
      objectReply(vulnerability),
      `/api/vulnerabilities/${vulnerability.id}`,
      vulnerability,
    );

    expect(fetchMock).toHaveBeenCalledTimes(17);
  });
});
