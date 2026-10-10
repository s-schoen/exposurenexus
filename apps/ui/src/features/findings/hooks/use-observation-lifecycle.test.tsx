import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useObservationLifecycle } from "@/features/findings/hooks/use-observation-lifecycle.ts";
import {
  createFindingByIDQueryOptions,
  createFindingObservationsQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
} from "@/features/findings/queries/findings.ts";
import { computeFindingStatistics } from "@/mocks/db.ts";
import { SEED_FINDINGS, SEED_OBSERVATIONS } from "@/mocks/fixtures/index.ts";
import { renderHookWithApp } from "@/test/harness.tsx";
import { db, mockApiError } from "@/test/msw.ts";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// Page flows live in finding-observations.app.test.tsx; this covers which reads are invalidated.

const [ADMIN_ENDPOINT, OUTDATED_DEPENDENCY, ROOT_CONTAINER] = SEED_FINDINGS;
const [MANUAL_REPORT, SCANNER_REPORT] = SEED_OBSERVATIONS;
const listKey = createListFindingsQueryOptions().queryKey;
const statsKey = createFindingStatsQueryOptions().queryKey;
const detailKey = (id: string) => createFindingByIDQueryOptions(id).queryKey;
const observationsKey = (id: string) => createFindingObservationsQueryOptions(id).queryKey;

function seedCache(queryClient: QueryClient) {
  queryClient.setQueryData(listKey, SEED_FINDINGS);
  queryClient.setQueryData(statsKey, computeFindingStatistics(db));
  for (const finding of SEED_FINDINGS) {
    queryClient.setQueryData(detailKey(finding.id), finding);
    queryClient.setQueryData(observationsKey(finding.id), []);
  }
}

const isInvalidated = (queryClient: QueryClient, key: QueryKey) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

function expectFindingReadsInvalidated(queryClient: QueryClient, findingIds: Array<string>) {
  for (const id of findingIds) {
    expect(isInvalidated(queryClient, detailKey(id))).toBe(true);
    expect(isInvalidated(queryClient, observationsKey(id))).toBe(true);
  }
  expect(isInvalidated(queryClient, listKey)).toBe(true);
  expect(isInvalidated(queryClient, statsKey)).toBe(true);
  expect(isInvalidated(queryClient, detailKey(ROOT_CONTAINER.id))).toBe(false);
}

function renderLifecycle() {
  const view = renderHookWithApp(() => useObservationLifecycle());
  seedCache(view.queryClient);
  return view;
}

describe("useObservationLifecycle", () => {
  it("adds an observation and invalidates its finding's reads", async () => {
    const { queryClient, result } = renderLifecycle();

    let added = null;
    await act(async () => {
      added = await result.current.addObservation(OUTDATED_DEPENDENCY.id, { title: "Seen again" });
    });

    expect(added).toMatchObject({ findingId: OUTDATED_DEPENDENCY.id, title: "Seen again" });
    expectFindingReadsInvalidated(queryClient, [OUTDATED_DEPENDENCY.id]);
    expect(isInvalidated(queryClient, detailKey(ADMIN_ENDPOINT.id))).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Observation added");
  });

  it("updates and deletes observations", async () => {
    const { queryClient, result } = renderLifecycle();

    await act(async () => {
      await result.current.updateObservation(ADMIN_ENDPOINT.id, MANUAL_REPORT.id, {
        title: "Renamed",
      });
    });
    expect(db.observations.get(MANUAL_REPORT.id)?.title).toBe("Renamed");
    expectFindingReadsInvalidated(queryClient, [ADMIN_ENDPOINT.id]);

    await act(async () => {
      await result.current.deleteObservation(ADMIN_ENDPOINT.id, MANUAL_REPORT.id);
    });
    expect(db.observations.get(MANUAL_REPORT.id)).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith("Observation deleted");
  });

  it("invalidates both findings when moving an observation", async () => {
    const { queryClient, result } = renderLifecycle();

    let moved = null;
    await act(async () => {
      moved = await result.current.moveObservation(
        ADMIN_ENDPOINT.id,
        SCANNER_REPORT.id,
        OUTDATED_DEPENDENCY.id,
      );
    });

    expect(moved).toMatchObject({ id: SCANNER_REPORT.id, findingId: OUTDATED_DEPENDENCY.id });
    expectFindingReadsInvalidated(queryClient, [ADMIN_ENDPOINT.id, OUTDATED_DEPENDENCY.id]);
    expect(toast.success).toHaveBeenCalledWith("Observation moved");
  });

  it.each([
    ["add", "post", "/findings/:id/observations", "Failed to add observation"],
    ["update", "put", "/findings/:id/observations/:observationId", "Failed to update observation"],
    [
      "delete",
      "delete",
      "/findings/:id/observations/:observationId",
      "Failed to delete observation",
    ],
    [
      "move",
      "post",
      "/findings/:id/observations/:observationId/move",
      "Failed to move observation",
    ],
  ] as const)(
    "returns null without invalidating when %s fails",
    async (action, method, path, message) => {
      mockApiError(method, path, 500, "Request failed");
      const { queryClient, result } = renderLifecycle();

      let outcome: unknown = "unset";
      await act(async () => {
        const actions = result.current;
        outcome =
          action === "add"
            ? await actions.addObservation(ADMIN_ENDPOINT.id, { title: "x" })
            : action === "update"
              ? await actions.updateObservation(ADMIN_ENDPOINT.id, MANUAL_REPORT.id, { title: "x" })
              : action === "delete"
                ? await actions.deleteObservation(ADMIN_ENDPOINT.id, MANUAL_REPORT.id)
                : await actions.moveObservation(
                    ADMIN_ENDPOINT.id,
                    MANUAL_REPORT.id,
                    ROOT_CONTAINER.id,
                  );
      });

      expect(outcome).toBeNull();
      expect(isInvalidated(queryClient, listKey)).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(message));
    },
  );
});
