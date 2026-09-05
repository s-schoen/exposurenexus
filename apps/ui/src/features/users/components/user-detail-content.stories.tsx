import { UserRoundPen } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { UserDetailContent } from "@/features/users/components/user-detail-content.tsx";
import { ROLE_FIXTURES, STORY_USERS } from "@/test/fixtures.ts";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Resources/Users/Detail",
  component: UserDetailContent,
  parameters: { layout: "padded" },
  args: {
    user: STORY_USERS[1],
    roles: ROLE_FIXTURES,
    titleAction: (
      <Button type="button" variant="outline" size="sm">
        <UserRoundPen />
        Edit user
      </Button>
    ),
  },
} satisfies Meta<typeof UserDetailContent>;

export default meta;
type Story = StoryObj<typeof meta>;
export const EnabledUser: Story = {};
export const DisabledUser: Story = {
  args: {
    user: {
      ...STORY_USERS[2],
      roleIds: [ROLE_FIXTURES[0].id, "11111111-1111-4111-8111-111111111111"],
    },
  },
};
export const NoRoles: Story = { args: { user: { ...STORY_USERS[1], roleIds: [] } } };
