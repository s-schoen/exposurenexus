import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFindingLifecycle } from "@/features/findings/hooks/use-finding-lifecycle.ts";
import {
  createFindingByIDQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
} from "@/features/findings/queries/findings.ts";

import type { FindingDeleteBatchResult } from "@/features/findings/hooks/use-finding-lifecycle.ts";
import type { CreateManualFinding, Finding } from "@exposurenexus/contracts/model/finding";
import type { ReactNode } from "react";

const {
  createFindingRequestMock,
  deleteFindingRequestMock,
  linkFindingVulnerabilityRequestMock,
  unlinkFindingVulnerabilityRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateFindingRequestMock,
} = vi.hoisted(() => ({
  createFindingRequestMock: vi.fn(),
  deleteFindingRequestMock: vi.fn(),
  linkFindingVulnerabilityRequestMock: vi.fn(),
  unlinkFindingVulnerabilityRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateFindingRequestMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/features/findings/mutations/findings.ts", () => ({
  useCreateFindingMutation: () => ({
    mutateAsync: createFindingRequestMock,
  }),
  useDeleteFindingMutation: () => ({
    mutateAsync: deleteFindingRequestMock,
  }),
  useUpdateFindingMutation: () => ({
    mutateAsync: updateFindingRequestMock,
  }),
  useLinkFindingVulnerabilityMutation: () => ({
    mutateAsync: linkFindingVulnerabilityRequestMock,
  }),
  useUnlinkFindingVulnerabilityMutation: () => ({
    mutateAsync: unlinkFindingVulnerabilityRequestMock,
  }),
}));

const userId = "1f9c36d2-1355-49d1-8464-b01ce955d88f";
function createFindingFixture(overrides: Partial<Finding> = {}): Finding {
  const id = overrides.id ?? "2713d833-eb13-4517-ac7c-7761545ed42a";
  const createdAt = new Date("2026-01-02T00:00:00.000Z");
  const updatedAt = new Date("2026-01-03T00:00:00.000Z");

  return {
    id,
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    mitigation: "Restrict access to internal networks",
    assigneeId: null,
    dueDate: null,
    weakness: { identifiers: { cwe: ["CWE-284"] } },
    affectedResource: { type: AffectedResourceType.Unspecified },
    vulnerabilities: [],
    observationCount: 1,
    firstSeen: createdAt,
    lastSeen: updatedAt,
    createdBy: userId,
    updatedBy: userId,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderLifecycleHook(queryClient = createQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    queryClient,
    ...renderHook(() => useFindingLifecycle(), { wrapper }),
  };
}

beforeEach(() => {
  createFindingRequestMock.mockReset();
  deleteFindingRequestMock.mockReset();
  linkFindingVulnerabilityRequestMock.mockReset();
  unlinkFindingVulnerabilityRequestMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  updateFindingRequestMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useFindingLifecycle", () => {
  it("writes an authoritative correction after the mutation resolves", async () => {
    const finding = createFindingFixture();
    const correctedFinding = {
      ...finding,
      title: "Corrected finding",
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    };
    const update = createDeferred<Finding>();
    updateFindingRequestMock.mockReturnValueOnce(update.promise);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [finding]);
    queryClient.setQueryData(createFindingByIDQueryOptions(finding.id).queryKey, finding);

    let operation!: Promise<Finding | null>;
    act(() => {
      operation = result.current.correctFinding(finding.id, { title: correctedFinding.title });
    });

    expect(
      queryClient.getQueryData<Finding>(createFindingByIDQueryOptions(finding.id).queryKey),
    ).toEqual(finding);
    expect(
      queryClient.getQueryData<Array<Finding>>(createListFindingsQueryOptions().queryKey)?.[0]
        .title,
    ).toBe(finding.title);
    expect(updateFindingRequestMock).toHaveBeenCalledWith({
      id: finding.id,
      update: { title: correctedFinding.title },
    });

    await act(async () => {
      update.resolve(correctedFinding);
      await operation;
    });

    expect(
      queryClient.getQueryData<Finding>(createFindingByIDQueryOptions(finding.id).queryKey),
    ).toEqual(correctedFinding);
    expect(
      queryClient.getQueryData<Array<Finding>>(createListFindingsQueryOptions().queryKey),
    ).toEqual([correctedFinding]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListFindingsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingByIDQueryOptions(finding.id).queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingStatsQueryOptions().queryKey,
      exact: true,
    });
  });

  it("returns null and leaves caches unchanged when correction fails", async () => {
    const finding = createFindingFixture();
    const update = createDeferred<Finding>();
    updateFindingRequestMock.mockReturnValueOnce(update.promise);
    const { queryClient, result } = renderLifecycleHook();

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [finding]);
    queryClient.setQueryData(createFindingByIDQueryOptions(finding.id).queryKey, finding);

    let operation!: Promise<Finding | null>;
    act(() => {
      operation = result.current.correctFinding(finding.id, { title: "Unsaved correction" });
    });

    expect(
      queryClient.getQueryData<Finding>(createFindingByIDQueryOptions(finding.id).queryKey),
    ).toEqual(finding);

    await act(async () => {
      update.reject(new Error("Correction failed"));
      await operation;
    });

    expect(
      queryClient.getQueryData<Finding>(createFindingByIDQueryOptions(finding.id).queryKey),
    ).toEqual(finding);
    expect(
      queryClient.getQueryData<Array<Finding>>(createListFindingsQueryOptions().queryKey),
    ).toEqual([finding]);
    await expect(operation).resolves.toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to update finding");
  });

  it("creates findings and invalidates the unnested list query key plus stats", async () => {
    const finding = createFindingFixture();
    const value: CreateManualFinding = {
      title: "Exposed admin endpoint",
      severity: finding.severity,
      status: finding.status,
      mitigation: finding.mitigation,
      assetId: finding.assetId,
      assigneeId: null,
      dueDate: null,
      weakness: { identifiers: {} },
      affectedResource: { type: AffectedResourceType.Unspecified },
      vulnerabilityIds: [],
      observation: {},
    };
    createFindingRequestMock.mockResolvedValueOnce(finding);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    await act(async () => {
      await result.current.createFinding(value);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["findings"],
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingStatsQueryOptions().queryKey,
      exact: true,
    });
  });

  it("returns null without invalidating when creation fails", async () => {
    const error = new Error("Create failed");
    createFindingRequestMock.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    await act(async () => {
      await expect(
        result.current.createFinding({
          assetId: createFindingFixture().assetId,
          title: "Finding",
          severity: VulnerabilitySeverity.High,
          status: FindingStatus.Active,
          assigneeId: null,
          dueDate: null,
          mitigation: null,
          weakness: { identifiers: {} },
          affectedResource: { type: AffectedResourceType.Unspecified },
          vulnerabilityIds: [],
          observation: {},
        }),
      ).resolves.toBeNull();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to create finding: Error: Create failed");
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it("writes the authoritative finding after linking a catalog entry", async () => {
    const finding = createFindingFixture();
    const linkedFinding = {
      ...finding,
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    };
    const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
    linkFindingVulnerabilityRequestMock.mockResolvedValueOnce(linkedFinding);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [finding]);
    queryClient.setQueryData(createFindingByIDQueryOptions(finding.id).queryKey, finding);

    await act(async () => {
      await result.current.linkVulnerability(finding.id, vulnerabilityId);
    });

    expect(linkFindingVulnerabilityRequestMock).toHaveBeenCalledWith({
      findingId: finding.id,
      vulnerabilityId,
    });
    expect(
      queryClient.getQueryData<Finding>(createFindingByIDQueryOptions(finding.id).queryKey),
    ).toEqual(linkedFinding);
    expect(
      queryClient.getQueryData<Array<Finding>>(createListFindingsQueryOptions().queryKey),
    ).toEqual([linkedFinding]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingByIDQueryOptions(finding.id).queryKey,
      exact: true,
    });
  });

  it("writes the authoritative finding after unlinking a catalog entry", async () => {
    const finding = createFindingFixture();
    const unlinkedFinding = {
      ...finding,
      updatedAt: new Date("2026-01-04T00:00:00.000Z"),
    };
    const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe";
    unlinkFindingVulnerabilityRequestMock.mockResolvedValueOnce(unlinkedFinding);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [finding]);
    queryClient.setQueryData(createFindingByIDQueryOptions(finding.id).queryKey, finding);

    await act(async () => {
      await result.current.unlinkVulnerability(finding.id, vulnerabilityId);
    });

    expect(unlinkFindingVulnerabilityRequestMock).toHaveBeenCalledWith({
      findingId: finding.id,
      vulnerabilityId,
    });
    expect(
      queryClient.getQueryData<Finding>(createFindingByIDQueryOptions(finding.id).queryKey),
    ).toEqual(unlinkedFinding);
    expect(
      queryClient.getQueryData<Array<Finding>>(createListFindingsQueryOptions().queryKey),
    ).toEqual([unlinkedFinding]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingByIDQueryOptions(finding.id).queryKey,
      exact: true,
    });
  });

  it.each([
    [
      "link",
      linkFindingVulnerabilityRequestMock,
      "Failed to link catalog entry: Error: Link failed",
    ],
    [
      "unlink",
      unlinkFindingVulnerabilityRequestMock,
      "Failed to unlink catalog entry: Error: Unlink failed",
    ],
  ] as const)(
    "returns null without cache writes when catalog %s fails",
    async (action, request, toast) => {
      const finding = createFindingFixture();
      const error = new Error(action === "link" ? "Link failed" : "Unlink failed");
      request.mockRejectedValueOnce(error);
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { queryClient, result } = renderLifecycleHook();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
      queryClient.setQueryData(createFindingByIDQueryOptions(finding.id).queryKey, finding);

      await act(async () => {
        const operation =
          action === "link"
            ? result.current.linkVulnerability(finding.id, "vulnerability-id")
            : result.current.unlinkVulnerability(finding.id, "vulnerability-id");
        await expect(operation).resolves.toBeNull();
      });

      expect(queryClient.getQueryData(createFindingByIDQueryOptions(finding.id).queryKey)).toEqual(
        finding,
      );
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(toastErrorMock).toHaveBeenCalledWith(toast);
    },
  );

  it("reports partial delete failures and invalidates affected reads", async () => {
    const first = createFindingFixture({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });
    const second = createFindingFixture({
      id: "f83f9298-2271-4b13-84fe-13724989243b",
    });
    deleteFindingRequestMock.mockImplementation((id: string) =>
      id === first.id ? Promise.resolve(first) : Promise.reject(new Error("Delete failed")),
    );
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let batchResult: FindingDeleteBatchResult | undefined;
    await act(async () => {
      batchResult = await result.current.deleteFindings([first, second]);
    });

    expect(batchResult).toMatchObject({
      successful: [first],
      failed: [{ finding: second }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListFindingsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingStatsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingByIDQueryOptions(first.id).queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingByIDQueryOptions(second.id).queryKey,
      exact: true,
    });
    expect(toastErrorMock).toHaveBeenCalledWith("Deleted 1 finding; failed 1 finding");
  });

  it("returns an empty delete summary without side effects", async () => {
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    await act(async () => {
      await expect(result.current.deleteFindings([])).resolves.toEqual({
        successful: [],
        failed: [],
      });
    });

    expect(deleteFindingRequestMock).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it.each([
    { succeeds: true, toast: "Deleted 2 findings" },
    { succeeds: false, toast: "Failed to delete 2 findings" },
  ])("summarizes all-success and all-failure deletes", async ({ succeeds, toast }) => {
    const findings = [
      createFindingFixture(),
      createFindingFixture({ id: "f83f9298-2271-4b13-84fe-13724989243b" }),
    ];
    deleteFindingRequestMock.mockImplementation((id: string) =>
      succeeds
        ? Promise.resolve(findings.find((finding) => finding.id === id))
        : Promise.reject(new Error("Delete failed")),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderLifecycleHook();

    await act(async () => {
      await result.current.deleteFindings(findings);
    });

    expect(succeeds ? toastSuccessMock : toastErrorMock).toHaveBeenCalledWith(toast);
  });
});
