import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/components/route-pending-state.stories.tsx";

const { Default } = composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("RoutePendingState", () => {
  it("renders the page loading message", () => {
    render(<Default />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading page…");
  });
});
