import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/features/users/components/user-preview.stories";

const { EnabledUser, Loading, RolesLoading, ErrorState, RolesError } = composeStories(stories);
afterEach(cleanup);

describe("UserPreview", () => {
  it("renders the selected user and role labels", async () => {
    render(<EnabledUser />);
    expect((await screen.findAllByText(EnabledUser.args.user!.displayName)).length).toBeGreaterThan(
      0,
    );
  });
  it.each([Loading, RolesLoading])("contains pending queries in the detail boundary", (Story) => {
    const { container } = render(<Story />);
    expect(screen.getByText("User details")).toBeVisible();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  });
  it.each([
    [ErrorState, "Unable to load user", "User not found"],
    [RolesError, "Unable to load roles", "Roles request failed"],
  ] as const)("contains request failures in the detail boundary", async (Story, title, message) => {
    render(<Story />);
    expect(await screen.findByText(title)).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
  });
});
