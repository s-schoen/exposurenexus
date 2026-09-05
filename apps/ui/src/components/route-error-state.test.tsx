import { composeStories } from "@storybook/react-vite";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as stories from "@/components/route-error-state.stories.tsx";
import { RouteErrorState } from "@/components/route-error-state.tsx";

const { ErrorState, UnexpectedError } = composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("RouteErrorState", () => {
  it("renders the error message and retries through the reset callback", async () => {
    const reset = ErrorState.args.reset;

    render(<ErrorState error={new Error("Page request failed")} />);

    expect(screen.getByRole("heading", { name: "Unable to load this page" })).toBeTruthy();
    expect(screen.getByText("Page request failed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  });

  it("renders the fallback when the error has no message", () => {
    render(<UnexpectedError />);

    expect(screen.getByText("An unexpected error occurred.")).toBeTruthy();
  });

  it("retries a failed loader query and renders the recovered page", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Temporary outage"))
      .mockResolvedValue("Recovered page");
    const options = queryOptions({ queryKey: ["retry-page"], queryFn: request });
    const root = createRootRoute();
    const route = createRoute({
      getParentRoute: () => root,
      path: "/",
      loader: () => queryClient.ensureQueryData(options),
      component: () => <p>{route.useLoaderData()}</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      defaultErrorComponent: RouteErrorState,
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("Temporary outage")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Recovered page")).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
    queryClient.clear();
  });
});
