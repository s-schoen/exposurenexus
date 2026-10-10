import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFindingLifecycle } from "@/features/findings/hooks/use-finding-lifecycle.ts";
import {
  createFindingByIDQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
} from "@/features/findings/queries/findings.ts";
import { computeFindingStatistics } from "@/mocks/db.ts";
import { SEED_ASSETS, SEED_FINDINGS, SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";
import { renderHookWithApp } from "@/test/harness.tsx";
import { db, holdApiResponses, mockApiError, recordApiRequests } from "@/test/msw.ts";

import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// Page flows live in findings.app.test.tsx; this covers return values and cache effects.

const [ADMIN_ENDPOINT, OUTDATED_DEPENDENCY, ROOT_CONTAINER] = SEED_FINDINGS;
const [, ACCOUNT_TAKEOVER] = SEED_VULNERABILITIES;
const listKey = createListFindingsQueryOptions().queryKey;
const statsKey = createFindingStatsQueryOptions().queryKey;
const detailKey = (id: string) => createFindingByIDQueryOptions(id).queryKey;
const unrelatedKey = ["assets"];

function seedCache(queryClient: QueryClient) {
  queryClient.setQueryData(listKey, SEED_FINDINGS);
  queryClient.setQueryData(statsKey, computeFindingStatistics(db));
  for (const finding of SEED_FINDINGS) {
    queryClient.setQueryData(detailKey(finding.id), finding);
  }
  queryClient.setQueryData(unrelatedKey, []);
}

const isInvalidated = (queryClient: QueryClient, key: QueryKey) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

function renderLifecycle() {
  const view = renderHookWithApp(() => useFindingLifecycle());
  seedCache(view.queryClient);
  return view;
}

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useFindingLifecycle", () => {
  it("creates a finding and invalidates the list and stats", async () => {
    const { queryClient, result } = renderLifecycle();

    let created: Finding | null = null;
    await act(async () => {
      created = await result.current.createFinding({
        assetId: SEED_ASSETS[0].id,
        title: "Hard-coded secret",
        severity: VulnerabilitySeverity.High,
        status: FindingStatus.Active,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        vulnerabilityIds: [],
      });
    });

    expect(created).toMatchObject({ title: "Hard-coded secret" });
    expect(db.findings.get(created!.id)).toBeDefined();
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, statsKey)).toBe(true);
    expect(isInvalidated(queryClient, unrelatedKey)).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Finding created");
  });

  it("writes a correction to the caches only once the API confirms it", async () => {
    const pending = holdApiResponses("put", "/findings/:id");
    const { queryClient, result } = renderLifecycle();

    let correcting!: Promise<Finding | null>;
    act(() => {
      correcting = result.current.correctFinding(ADMIN_ENDPOINT.id, { title: "Renamed" });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queryClient.getQueryData<Finding>(detailKey(ADMIN_ENDPOINT.id))?.title).toBe(
      ADMIN_ENDPOINT.title,
    );

    pending.release();
    let corrected: Finding | null = null;
    await act(async () => {
      corrected = await correcting;
    });

    expect(corrected).toMatchObject({ id: ADMIN_ENDPOINT.id, title: "Renamed" });
    expect(queryClient.getQueryData<Finding>(detailKey(ADMIN_ENDPOINT.id))?.title).toBe("Renamed");
    expect(
      queryClient.getQueryData<Array<Finding>>(listKey)?.find((f) => f.id === ADMIN_ENDPOINT.id)
        ?.title,
    ).toBe("Renamed");
    expect(isInvalidated(queryClient, statsKey)).toBe(true);
    expect(isInvalidated(queryClient, detailKey(OUTDATED_DEPENDENCY.id))).toBe(false);
  });

  it("returns null and leaves caches alone when a correction fails", async () => {
    mockApiError("put", "/findings/:id", 500);
    const { queryClient, result } = renderLifecycle();

    let corrected: unknown = "unset";
    await act(async () => {
      corrected = await result.current.correctFinding(ADMIN_ENDPOINT.id, { title: "Renamed" });
    });

    expect(corrected).toBeNull();
    expect(queryClient.getQueryData(detailKey(ADMIN_ENDPOINT.id))).toEqual(ADMIN_ENDPOINT);
    expect(isInvalidated(queryClient, listKey)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Failed to update finding");
  });

  it("links and unlinks catalog entries through the caches", async () => {
    const { queryClient, result } = renderLifecycle();

    await act(async () => {
      await result.current.linkVulnerability(ADMIN_ENDPOINT.id, ACCOUNT_TAKEOVER.id);
    });
    expect(
      queryClient
        .getQueryData<Finding>(detailKey(ADMIN_ENDPOINT.id))
        ?.vulnerabilities.map((vulnerability) => vulnerability.id),
    ).toContain(ACCOUNT_TAKEOVER.id);
    expect(toast.success).toHaveBeenCalledWith("Linked catalog entry to finding");

    await act(async () => {
      await result.current.unlinkVulnerability(ADMIN_ENDPOINT.id, ACCOUNT_TAKEOVER.id);
    });
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.vulnerabilityIds).not.toContain(ACCOUNT_TAKEOVER.id);
    expect(toast.success).toHaveBeenCalledWith("Unlinked catalog entry from finding");
  });

  it("reports failed links with the API message", async () => {
    mockApiError("put", "/findings/:id/vulnerabilities/:vulnerabilityId", 500, "Link failed");
    const { result } = renderLifecycle();

    let linked: unknown = "unset";
    await act(async () => {
      linked = await result.current.linkVulnerability(ADMIN_ENDPOINT.id, ACCOUNT_TAKEOVER.id);
    });

    expect(linked).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Link failed"));
  });

  it("returns an empty delete summary without requests", async () => {
    const requests = recordApiRequests();
    const { result } = renderLifecycle();

    let summary = null;
    await act(async () => {
      summary = await result.current.deleteFindings([]);
    });

    expect(summary).toEqual({ successful: [], failed: [] });
    expect(requests).toEqual([]);
  });

  it("summarizes a partially failed delete and invalidates the affected reads", async () => {
    mockApiError("delete", `/findings/${ROOT_CONTAINER.id}`, 500);
    const { queryClient, result } = renderLifecycle();

    let summary: Awaited<ReturnType<typeof result.current.deleteFindings>> | null = null;
    await act(async () => {
      summary = await result.current.deleteFindings([OUTDATED_DEPENDENCY, ROOT_CONTAINER]);
    });

    expect(summary!.successful.map((finding) => finding.id)).toEqual([OUTDATED_DEPENDENCY.id]);
    expect(summary!.failed.map((failure) => failure.finding.id)).toEqual([ROOT_CONTAINER.id]);
    await waitFor(() => expect(isInvalidated(queryClient, listKey)).toBe(true));
    expect(isInvalidated(queryClient, statsKey)).toBe(true);
    expect(isInvalidated(queryClient, detailKey(ADMIN_ENDPOINT.id))).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Deleted 1 .*failed 1/));
  });
});
