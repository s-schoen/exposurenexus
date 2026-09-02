import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { RoleForm, getAvailableRolePermissions } from "@/components/role-form.tsx";
import { CUSTOM_AUDITOR_ROLE, ROLE_FIXTURES } from "@/test/fixtures.ts";

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";

type RoleFormStoryArgs = ComponentProps<typeof RoleForm>;

const availablePermissions = getAvailableRolePermissions(ROLE_FIXTURES);

function RoleFormStoryShell(args: RoleFormStoryArgs) {
  const [lastSubmittedValues, setLastSubmittedValues] =
    useState<RoleFormStoryArgs["defaultValues"]>();

  const handleSubmit: RoleFormStoryArgs["onSubmit"] = async (values) => {
    setLastSubmittedValues(values);
    await args.onSubmit(values);
  };

  return (
    <div className="w-full max-w-2xl space-y-4">
      <RoleForm {...args} onSubmit={handleSubmit} />
      {lastSubmittedValues ? (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <p className="text-sm font-medium text-foreground">Last submitted</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            {JSON.stringify(lastSubmittedValues, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

const meta = {
  title: "Resources/Roles/Form",
  component: RoleForm,
  parameters: {
    layout: "padded",
  },
  args: {
    mode: "create",
    availablePermissions,
    onSubmit: fn(async (_values) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }),
    onCancel: fn(),
  },
  render: (args) => <RoleFormStoryShell {...args} />,
} satisfies Meta<typeof RoleForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const EditPrefilled: Story = {
  args: {
    mode: "edit",
    defaultValues: {
      name: CUSTOM_AUDITOR_ROLE.name,
      permissions: CUSTOM_AUDITOR_ROLE.permissions,
    },
  },
};

export const ZeroPermissions: Story = {
  args: {
    defaultValues: {
      name: "no-access",
      permissions: [],
    },
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button", { name: /create role/i }));

    await expect(await canvas.findAllByRole("alert")).not.toHaveLength(0);
  },
};

export const Submitting: Story = {
  args: {
    defaultValues: {
      name: "security-analyst",
    },
    onSubmit: fn(async (_values) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button", { name: /create role/i }));

    await expect(args.onSubmit).toHaveBeenCalled();
  },
};
