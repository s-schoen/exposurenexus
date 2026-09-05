import { RoleDetailContent } from "@/features/roles/components/role-detail-content.tsx";
import { BUILT_IN_ADMIN_ROLE, CUSTOM_AUDITOR_ROLE } from "@/test/fixtures.ts";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Resources/Roles/Detail",
  component: RoleDetailContent,
  parameters: { layout: "padded" },
  args: { role: BUILT_IN_ADMIN_ROLE },
} satisfies Meta<typeof RoleDetailContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BuiltInAdmin: Story = {};
export const CustomRole: Story = { args: { role: CUSTOM_AUDITOR_ROLE } };
