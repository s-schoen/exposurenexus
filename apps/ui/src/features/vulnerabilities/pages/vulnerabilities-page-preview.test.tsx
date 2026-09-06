import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { getVulnerabilityByID } from "@/features/vulnerabilities/api/vulnerabilities.ts";
import { VulnerabilitiesPage } from "@/features/vulnerabilities/pages/vulnerabilities-page.tsx";
import { STORY_VULNERABILITIES } from "@/test/fixtures.ts";

import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/use-page-meta.tsx", () => ({ usePageMeta: vi.fn() }));
vi.mock("@/features/vulnerabilities/hooks/use-vulnerability-lifecycle.ts", () => ({
  useVulnerabilityLifecycle: () => ({}),
}));
vi.mock("@/features/vulnerabilities/api/vulnerabilities.ts", () => ({
  getVulnerabilityByID: vi.fn(),
  listVulnerabilities: vi.fn(),
}));
vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: ({ children }: { children: ReactNode }) => (
    <section aria-label="User preview">{children}</section>
  ),
}));
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("does not fetch a preview until selected and keeps the table usable after preview failure", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["vulnerabilities"], [STORY_VULNERABILITIES[1]]);
  vi.mocked(getVulnerabilityByID).mockRejectedValue(new Error("Preview request failed"));
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <VulnerabilitiesPage />
    </QueryClientProvider>,
  );
  expect(screen.getByText(STORY_VULNERABILITIES[1].title)).toBeVisible();
  expect(getVulnerabilityByID).not.toHaveBeenCalled();
  rerender(
    <QueryClientProvider client={client}>
      <VulnerabilitiesPage selected={STORY_VULNERABILITIES[1].id} />
    </QueryClientProvider>,
  );
  // The real lazy preview module can take longer to load alongside Chromium stories.
  expect(
    await screen.findByText("Unable to load catalog entry", {}, { timeout: 10000 }),
  ).toBeVisible();
  expect(screen.getByText("Preview request failed")).toBeVisible();
  expect(screen.getByText(STORY_VULNERABILITIES[1].title)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "New catalog entry" }));
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/vulnerabilities/new" });
  expect(getVulnerabilityByID).toHaveBeenCalledExactlyOnceWith(STORY_VULNERABILITIES[1].id);
});
