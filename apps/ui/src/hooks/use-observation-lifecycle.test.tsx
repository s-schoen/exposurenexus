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

const { createObservationRequestMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  createObservationRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
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
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
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
});
