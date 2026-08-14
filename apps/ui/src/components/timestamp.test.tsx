import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/components/timestamp.stories";

const { DateValue, InvalidDate, StringValue } = composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("Timestamp stories", () => {
  it("renders Date values as semantic timestamps", () => {
    render(<DateValue />);

    const timestamp = screen.getByText(/2026/);

    expect(timestamp.tagName.toLowerCase()).toBe("time");
    expect(timestamp).toHaveAttribute("datetime", "2026-01-02T03:04:05.000Z");
  });

  it("renders string values as semantic timestamps", () => {
    render(<StringValue />);

    const timestamp = screen.getByText(/2026/);

    expect(timestamp.tagName.toLowerCase()).toBe("time");
    expect(timestamp).toHaveAttribute("datetime", "2026-01-02T03:04:05.000Z");
  });

  it("renders invalid values as a fallback label", () => {
    render(<InvalidDate />);

    expect(screen.getByText("Invalid date")).toBeVisible();
  });
});
