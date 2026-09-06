import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/features/users/components/user-detail-content.stories";

const { EnabledUser, DisabledUser, NoRoles } = composeStories(stories);
afterEach(cleanup);

describe("UserDetailContent", () => {
  it("renders resolved account fields, status, roles, and the title action", () => {
    render(<EnabledUser />);
    for (const value of [
      EnabledUser.args.user!.displayName,
      EnabledUser.args.user!.email,
      EnabledUser.args.user!.username,
      "Enabled",
    ]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    for (const role of EnabledUser.args.roles!.filter((candidate) =>
      EnabledUser.args.user!.roleIds.includes(candidate.id),
    )) {
      expect(screen.getAllByText(role.name).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: /edit user/i })).toBeVisible();
  });
  it("renders disabled accounts with resolved and unknown role badges", () => {
    render(<DisabledUser />);
    expect(screen.getAllByText("Disabled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+1 unknown").length).toBeGreaterThan(0);
    expect(screen.getAllByText(DisabledUser.args.roles![0].name).length).toBeGreaterThan(0);
  });
  it("renders accounts without assigned roles", () => {
    render(<NoRoles />);
    expect(screen.getAllByText("No roles").length).toBeGreaterThan(0);
  });
});
