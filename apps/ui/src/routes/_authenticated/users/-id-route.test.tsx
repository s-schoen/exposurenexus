import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentType } from "react";

const mocks = vi.hoisted(() => ({
  matchRoute: vi.fn(),
  userId: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
      useParams: () => ({ id: mocks.userId }),
    }),
    Outlet: () => <div>User edit child route</div>,
    useMatchRoute: () => mocks.matchRoute,
  });
});

vi.mock("@/features/users", () => ({
  UserDetailPage: ({ userId }: { userId: string }) => <div>User detail for {userId}</div>,
}));

describe("user id route", () => {
  beforeEach(() => {
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  async function renderRouteComponent() {
    const { Route } = await import("@/routes/_authenticated/users/$id.tsx");
    const RouteComponent = Route.options.component as ComponentType;

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <RouteComponent />
        </Suspense>,
      );
    });
  }

  it("renders user detail for the detail route", async () => {
    await renderRouteComponent();

    await waitFor(() => {
      expect(mocks.matchRoute).toHaveBeenCalledWith({
        to: "/users/$id/edit",
        params: { id: mocks.userId },
      });
    });
    expect(await screen.findByText(`User detail for ${mocks.userId}`)).toBeTruthy();
  });

  it("renders the child route for user edit", async () => {
    mocks.matchRoute.mockReturnValue(true);

    await renderRouteComponent();

    expect(await screen.findByText("User edit child route")).toBeTruthy();
    expect(screen.queryByText(`User detail for ${mocks.userId}`)).toBeNull();
  });
});
