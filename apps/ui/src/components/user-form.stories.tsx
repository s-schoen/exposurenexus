import {
  BuiltInRoleName,
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { UserForm } from "@/components/user-form";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";

type UserFormStoryArgs = ComponentProps<typeof UserForm>;

export const ROLE_FIXTURES: Array<Role> = [
  {
    id: builtInRoleIds.viewer,
    name: BuiltInRoleName.Viewer,
    permissions: [{ resource: PermissionResource.User, verb: PermissionVerb.Read }],
  },
  {
    id: builtInRoleIds.editor,
    name: BuiltInRoleName.Editor,
    permissions: [
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Write },
    ],
  },
  {
    id: builtInRoleIds.admin,
    name: BuiltInRoleName.Admin,
    permissions: [
      { resource: PermissionResource.User, verb: PermissionVerb.Read },
      { resource: PermissionResource.User, verb: PermissionVerb.Write },
      { resource: PermissionResource.User, verb: PermissionVerb.Delete },
    ],
  },
];

function UserFormStoryShell(args: UserFormStoryArgs) {
  const [lastSubmittedValues, setLastSubmittedValues] =
    useState<UserFormStoryArgs["defaultValues"]>();

  const handleSubmit: UserFormStoryArgs["onSubmit"] = async (values) => {
    setLastSubmittedValues(values);
    await args.onSubmit(values);
  };

  return (
    <div className="w-full max-w-2xl space-y-4">
      <UserForm {...args} onSubmit={handleSubmit} />
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
  title: "Resources/Users/Form",
  component: UserForm,
  parameters: {
    layout: "padded",
  },
  args: {
    mode: "create",
    roles: ROLE_FIXTURES,
    defaultValues: {
      roleIds: [builtInRoleIds.viewer],
    },
    onSubmit: fn(async (_values) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }),
    onCancel: fn(),
  },
  render: (args) => <UserFormStoryShell {...args} />,
} satisfies Meta<typeof UserForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const EditPrefilled: Story = {
  args: {
    mode: "edit",
    defaultValues: {
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor],
    },
  },
};

export const CustomSubmitLabel: Story = {
  args: {
    mode: "edit",
    defaultValues: {
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor],
    },
    submitLabel: "Update account",
  },
};

export const ValidationErrors: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button", { name: /create user/i }));
  },
};

export const Submitting: Story = {
  args: {
    onSubmit: fn(async (_values) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.type(await canvas.findByLabelText(/display name/i), "Alice Example");
    await userEvent.type(await canvas.findByLabelText(/username/i), "alice");
    await userEvent.type(await canvas.findByLabelText(/email/i), "alice@example.com");
    await userEvent.type(await canvas.findByLabelText(/password/i), "correct horse battery staple");
    await userEvent.click(await canvas.findByRole("button", { name: /create user/i }));

    await expect(args.onSubmit).toHaveBeenCalled();
  },
};

export const RoleSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole("combobox", { name: /roles/i }));
    await userEvent.type(await page.findByPlaceholderText(/search roles/i), "admin");
    await userEvent.click(await page.findByText("admin"));

    await expect(await canvas.findByRole("combobox", { name: /roles/i })).toHaveTextContent(
      /viewer, admin/i,
    );
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const DarkSurface: Story = {
  args: {
    mode: "edit",
    defaultValues: {
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor],
    },
  },
  render: (args) => (
    <div className="dark rounded-2xl bg-background p-6">
      <UserFormStoryShell {...args} />
    </div>
  ),
};
