import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  matchRoute: vi.fn(),
  roleId: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
      useParams: () => ({ id: mocks.roleId }),
    }),
    Outlet: () => <div>Role edit child route</div>,
    useMatchRoute: () => mocks.matchRoute,
  });
});

vi.mock("@/features/roles", () => ({
  RoleDetailPage: ({ roleId }: { roleId: string }) => <div>Role detail for {roleId}</div>,
}));

describe("role id route", () => {
  beforeEach(() => {
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  async function renderRouteComponent() {
    const { Route } = await import("@/routes/_authenticated/roles/$id.tsx");
    const RouteComponent = Route.options.component as ComponentType;

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <RouteComponent />
        </Suspense>,
      );
    });
  }

  it("renders role detail for the detail route", async () => {
    await renderRouteComponent();

    await waitFor(() => {
      expect(mocks.matchRoute).toHaveBeenCalledWith({
        to: "/roles/$id/edit",
        params: { id: mocks.roleId },
      });
    });
    expect(await screen.findByText(`Role detail for ${mocks.roleId}`)).toBeTruthy();
  });

  it("renders the child route for role edit", async () => {
    mocks.matchRoute.mockReturnValue(true);

    await renderRouteComponent();

    expect(await screen.findByText("Role edit child route")).toBeTruthy();
    expect(screen.queryByText(`Role detail for ${mocks.roleId}`)).toBeNull();
  });
});
