import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/components/role-detail-content.stories";

const { BuiltInAdmin, CustomRole, ErrorState, Loading } = composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("RoleDetailContent stories", () => {
  it("renders the built-in admin role details", async () => {
    render(<BuiltInAdmin />);

    await waitFor(() => {
      expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Built-in").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Permissions").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Delete").length).toBeGreaterThan(0);
    });
  });

  it("renders the custom role details", async () => {
    render(<CustomRole />);

    await waitFor(() => {
      expect(screen.getAllByText("security-auditor").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);
      expect(screen.getByText("No")).toBeTruthy();
    });
  });

  it("renders a loading placeholder while the query is pending", async () => {
    const { container } = render(<Loading />);

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    });
  });

  it("renders an error state when the role query fails", async () => {
    render(<ErrorState />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load role")).toBeTruthy();
      expect(screen.getByText("Role request failed")).toBeTruthy();
    });
  });
});
