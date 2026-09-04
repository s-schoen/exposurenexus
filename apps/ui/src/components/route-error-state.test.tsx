import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/components/route-error-state.stories.tsx";

const { ErrorState, UnexpectedError } = composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("RouteErrorState", () => {
  it("renders the error message and retries through the reset callback", () => {
    const reset = ErrorState.args.reset;

    render(<ErrorState error={new Error("Page request failed")} />);

    expect(screen.getByRole("heading", { name: "Unable to load this page" })).toBeTruthy();
    expect(screen.getByText("Page request failed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders the fallback when the error has no message", () => {
    render(<UnexpectedError />);

    expect(screen.getByText("An unexpected error occurred.")).toBeTruthy();
  });
});
