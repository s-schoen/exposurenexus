import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/features/custom-fields/components/custom-field-preview.stories";

const { ErrorState, Loading, SelectField, TextField } = composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("CustomFieldPreview stories", () => {
  it("renders select field details and options", async () => {
    render(<SelectField />);

    await waitFor(() => {
      expect(screen.getAllByText("Deployment tier").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Select").length).toBeGreaterThan(0);
      expect(screen.getAllByText("production").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Production").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Staging").length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: /add option/i })).toBeNull();
    });
  });

  it("renders text field details", async () => {
    render(<TextField />);

    await waitFor(() => {
      expect(screen.getAllByText("Category").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Text").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Optional").length).toBeGreaterThan(0);
    });
  });

  it("renders a loading placeholder while the query is pending", async () => {
    const { container } = render(<Loading />);

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    });
  });

  it("renders an error state when the custom field query fails", async () => {
    render(<ErrorState />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load custom field")).toBeTruthy();
      expect(screen.getByText("Custom field request failed")).toBeTruthy();
    });
  });
});
