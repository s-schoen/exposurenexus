import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  customFieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
  matchRoute: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
      useParams: () => ({ id: mocks.customFieldId }),
    }),
    Outlet: () => <div>Custom field edit child route</div>,
    useMatchRoute: () => mocks.matchRoute,
  });
});

vi.mock("@/features/custom-fields/components/custom-field-detail-page.tsx", () => ({
  CustomFieldDetailPage: ({ customFieldId }: { customFieldId: string }) => (
    <div>Custom field detail for {customFieldId}</div>
  ),
}));

describe("custom field id route", () => {
  beforeEach(() => {
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  async function renderRouteComponent() {
    const { Route } = await import("@/routes/_authenticated/custom-fields/$id.tsx");
    const RouteComponent = Route.options.component as ComponentType;

    await act(() => {
      render(
        <Suspense fallback={null}>
          <RouteComponent />
        </Suspense>,
      );
    });
  }

  it("renders custom field detail for the detail route", async () => {
    await renderRouteComponent();

    await waitFor(() => {
      expect(mocks.matchRoute).toHaveBeenCalledWith({
        to: "/custom-fields/$id/edit",
        params: { id: mocks.customFieldId },
      });
    });
    expect(await screen.findByText(`Custom field detail for ${mocks.customFieldId}`)).toBeTruthy();
  });

  it("renders the child route for custom field edit", async () => {
    mocks.matchRoute.mockReturnValue(true);

    await renderRouteComponent();

    expect(await screen.findByText("Custom field edit child route")).toBeTruthy();
    expect(screen.queryByText(`Custom field detail for ${mocks.customFieldId}`)).toBeNull();
  });
});
