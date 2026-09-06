import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import * as stories from "@/features/findings/components/finding-preview.stories.tsx";

const { Loaded, Loading, FindingError, AssetError, ObservationError } = composeStories(stories);
afterEach(cleanup);

it("renders the resolved finding and asset", async () => {
  render(<Loaded />);
  expect(await screen.findByText("Exposed Admin Endpoint")).toBeVisible();
  expect(screen.getAllByText("web-01").length).toBeGreaterThan(0);
});
it("shows a local loading placeholder", () => {
  render(<Loading />);
  expect(screen.getByText("Finding details")).toBeVisible();
});
it.each([
  [FindingError, "Unable to load finding", "Finding failed"],
  [AssetError, "Unable to load asset", "Asset failed"],
] as const)("contains a preview request failure", async (Story, title, message) => {
  render(
    <>
      <p>Findings table remains available</p>
      <Story />
    </>,
  );
  expect(await screen.findByText(title)).toBeVisible();
  expect(screen.getByText(message)).toBeVisible();
  expect(screen.getByText("Findings table remains available")).toBeVisible();
});
it("keeps resolved details visible when observations fail", async () => {
  render(<ObservationError />);
  expect(await screen.findByText("Unable to load observations")).toBeVisible();
  expect(screen.getByText("Exposed Admin Endpoint")).toBeVisible();
  expect(screen.getByRole("button", { name: "Edit finding" })).toBeVisible();
});
