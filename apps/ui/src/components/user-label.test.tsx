import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/components/user-label.stories";

const { Chip, Default, DisabledUser, Loading, NoUser, ResolvedProfile, UnknownUser } =
  composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("UserLabel stories", () => {
  it("renders the configured display name in the default state", async () => {
    render(<Default />);

    await waitFor(() => {
      expect(screen.getByText("Alice Example")).toBeTruthy();
    });
  });

  it("renders an already-resolved user profile without resolving by id", () => {
    render(<ResolvedProfile />);

    expect(screen.getByText("Alice Example")).toBeTruthy();
  });

  it("renders a configurable empty label for null user references", () => {
    render(<NoUser />);

    expect(screen.getByText("No Owner")).toBeTruthy();
  });

  it("renders a configurable unknown label for unresolved user references", async () => {
    render(<UnknownUser />);

    await waitFor(() => {
      expect(screen.getByText("Unknown Owner")).toBeTruthy();
    });
  });

  it("renders disabled users like enabled users", async () => {
    render(<DisabledUser />);

    await waitFor(() => {
      expect(screen.getByText("Taylor Example")).toBeTruthy();
    });
    expect(screen.queryByText("Disabled")).toBeNull();
  });

  it("renders the chip variant", async () => {
    render(<Chip />);

    await waitFor(() => {
      expect(screen.getByText("Alice Example").closest('[data-slot="badge"]')).toBeTruthy();
    });
  });

  it("renders a skeleton while the query is loading", async () => {
    const { container } = render(<Loading />);

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    });
  });
});
