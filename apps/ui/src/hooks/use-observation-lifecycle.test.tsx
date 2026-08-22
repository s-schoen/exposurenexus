import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFindingByIDQueryOptions,
  createFindingObservationsQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
} from "@/api/finding.ts";
import { useObservationLifecycle } from "@/hooks/use-observation-lifecycle.ts";

import type * as FindingApi from "@/api/finding.ts";
import type { Observation } from "@exposurenexus/types/model/observation";
import type { ReactNode } from "react";

const {
  createObservationRequestMock,
  deleteObservationRequestMock,
  moveObservationRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateObservationRequestMock,
} = vi.hoisted(() => ({
  createObservationRequestMock: vi.fn(),
  deleteObservationRequestMock: vi.fn(),
  moveObservationRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateObservationRequestMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/api/finding.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof FindingApi>();
  return {
    ...actual,
    useCreateFindingObservationMutation: () => ({
      mutateAsync: createObservationRequestMock,
    }),
    useUpdateFindingObservationMutation: () => ({
      mutateAsync: updateObservationRequestMock,
    }),
    useDeleteFindingObservationMutation: () => ({
      mutateAsync: deleteObservationRequestMock,
    }),
    useMoveFindingObservationMutation: () => ({
      mutateAsync: moveObservationRequestMock,
    }),
  };
});

const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a";
const userId = "1f9c36d2-1355-49d1-8464-b01ce955d88f";
const observation: Observation = {
  id: "f39a0c31-33b9-4f10-a128-35158dee4a26",
  findingId,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Exposed Admin Endpoint",
  description: null,
  evidence: "GET /admin returned 200",
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: { cwe: ["CWE-284"] } },
  affectedResource: { type: AffectedResourceType.Unspecified },
  observedAt: new Date("2026-01-04T00:00:00.000Z"),
  createdAt: new Date("2026-01-04T00:00:00.000Z"),
  updatedAt: new Date("2026-01-04T00:00:00.000Z"),
  createdBy: userId,
  updatedBy: userId,
};

function renderLifecycleHook() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useObservationLifecycle(), { wrapper }) };
}

beforeEach(() => {
  createObservationRequestMock.mockReset();
  deleteObservationRequestMock.mockReset();
  moveObservationRequestMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  updateObservationRequestMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useObservationLifecycle", () => {
  it("creates an observation and invalidates every exact affected read", async () => {
    createObservationRequestMock.mockResolvedValueOnce(observation);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let created: Observation | null = null;
    await act(async () => {
      created = await result.current.addObservation(findingId, {
        evidence: observation.evidence,
      });
    });

    expect(created).toEqual(observation);
    expect(createObservationRequestMock).toHaveBeenCalledWith({
      findingId,
      observation: { evidence: observation.evidence },
    });
    for (const queryKey of [
      createFindingObservationsQueryOptions(findingId).queryKey,
      createFindingByIDQueryOptions(findingId).queryKey,
      createListFindingsQueryOptions().queryKey,
      createFindingStatsQueryOptions().queryKey,
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey, exact: true });
    }
    expect(toastSuccessMock).toHaveBeenCalledWith("Observation added");
  });

  it("handles creation failures without invalidating caches", async () => {
    const error = new Error("Request failed");
    createObservationRequestMock.mockRejectedValueOnce(error);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let created: Observation | null = observation;
    await act(async () => {
      created = await result.current.addObservation(findingId, {});
    });

    expect(created).toBeNull();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to add observation: Error: Request failed");
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it("updates an observation and invalidates every exact affected read", async () => {
    updateObservationRequestMock.mockResolvedValueOnce(observation);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let changed: Observation | null = null;
    await act(async () => {
      changed = await result.current.updateObservation(findingId, observation.id, {
        title: "Corrected observation",
      });
    });

    expect(changed).toEqual(observation);
    expect(updateObservationRequestMock).toHaveBeenCalledWith({
      findingId,
      observationId: observation.id,
      update: { title: "Corrected observation" },
    });
    for (const queryKey of [
      createFindingObservationsQueryOptions(findingId).queryKey,
      createFindingByIDQueryOptions(findingId).queryKey,
      createListFindingsQueryOptions().queryKey,
      createFindingStatsQueryOptions().queryKey,
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey, exact: true });
    }
    expect(toastSuccessMock).toHaveBeenCalledWith("Observation updated");
  });

  it("deletes an observation and invalidates every exact affected read", async () => {
    deleteObservationRequestMock.mockResolvedValueOnce(observation);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let changed: Observation | null = null;
    await act(async () => {
      changed = await result.current.deleteObservation(findingId, observation.id);
    });

    expect(changed).toEqual(observation);
    expect(deleteObservationRequestMock).toHaveBeenCalledWith({
      findingId,
      observationId: observation.id,
    });
    for (const queryKey of [
      createFindingObservationsQueryOptions(findingId).queryKey,
      createFindingByIDQueryOptions(findingId).queryKey,
      createListFindingsQueryOptions().queryKey,
      createFindingStatsQueryOptions().queryKey,
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey, exact: true });
    }
    expect(toastSuccessMock).toHaveBeenCalledWith("Observation deleted");
  });

  it("moves an observation and invalidates both parent subtrees plus lists and stats", async () => {
    const targetFindingId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const moved = { ...observation, findingId: targetFindingId };
    moveObservationRequestMock.mockResolvedValueOnce(moved);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let changed: Observation | null = null;
    await act(async () => {
      changed = await result.current.moveObservation(findingId, observation.id, targetFindingId);
    });

    expect(changed).toEqual(moved);
    expect(moveObservationRequestMock).toHaveBeenCalledWith({
      findingId,
      observationId: observation.id,
      targetFindingId,
    });
    for (const queryKey of [
      createFindingObservationsQueryOptions(findingId).queryKey,
      createFindingByIDQueryOptions(findingId).queryKey,
      createFindingObservationsQueryOptions(targetFindingId).queryKey,
      createFindingByIDQueryOptions(targetFindingId).queryKey,
      createListFindingsQueryOptions().queryKey,
      createFindingStatsQueryOptions().queryKey,
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey, exact: true });
    }
    expect(toastSuccessMock).toHaveBeenCalledWith("Observation moved");
  });

  it("handles move failures without invalidating caches", async () => {
    const error = new Error("Request failed");
    moveObservationRequestMock.mockRejectedValueOnce(error);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let changed: Observation | null = observation;
    await act(async () => {
      changed = await result.current.moveObservation(
        findingId,
        observation.id,
        "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
      );
    });

    expect(changed).toBeNull();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to move observation: Error: Request failed",
    );
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it("handles observation update failures without invalidating caches", async () => {
    const error = new Error("Request failed");
    updateObservationRequestMock.mockRejectedValueOnce(error);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let changed: Observation | null = observation;
    await act(async () => {
      changed = await result.current.updateObservation(findingId, observation.id, {
        title: "Corrected",
      });
    });

    expect(changed).toBeNull();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to update observation: Error: Request failed",
    );
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it("handles observation deletion failures without invalidating caches", async () => {
    const error = new Error("Request failed");
    deleteObservationRequestMock.mockRejectedValueOnce(error);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let changed: Observation | null = observation;
    await act(async () => {
      changed = await result.current.deleteObservation(findingId, observation.id);
    });

    expect(changed).toBeNull();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to delete observation: Error: Request failed",
    );
    expect(console.error).toHaveBeenCalledWith(error);
  });
});
