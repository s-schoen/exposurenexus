import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/features/roles/components/role-detail-content.stories";

const { BuiltInAdmin, CustomRole } = composeStories(stories);

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
});
