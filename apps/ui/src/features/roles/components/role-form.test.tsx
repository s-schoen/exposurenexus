import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RoleForm,
  getAvailableRolePermissions,
  groupAvailableRolePermissions,
  mapCreateRoleFormValues,
  mapRoleToFormValues,
  mapUpdateRoleFormValues,
} from "@/features/roles/components/role-form";
import * as stories from "@/features/roles/components/role-form.stories";
import { CUSTOM_AUDITOR_ROLE, ROLE_FIXTURES } from "@/test/fixtures.ts";

import type { Permission, Role } from "@exposurenexus/contracts/model/rbac";

const { Create, EditPrefilled } = composeStories(stories);

afterEach(() => {
  cleanup();
});

function getInputByLabel(label: RegExp) {
  const element = screen.getByLabelText(label);

  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Expected input element");
  }

  return element;
}

async function clickPermission(
  user: ReturnType<typeof userEvent.setup>,
  resource: RegExp,
  verb: RegExp,
) {
  const group = screen.getByRole("group", { name: resource });
  await user.click(within(group).getByRole("checkbox", { name: verb }));
}

describe("RoleForm", () => {
  it("renders create-mode defaults and groups available permissions", () => {
    render(<Create />);

    expect(getInputByLabel(/^name$/i)).toHaveValue("");
    expect(screen.getByRole("group", { name: /asset/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /finding/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create role/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("renders edit-mode defaults", () => {
    render(<EditPrefilled />);

    expect(getInputByLabel(/^name$/i)).toHaveValue(CUSTOM_AUDITOR_ROLE.name);
    expect(
      within(screen.getByRole("group", { name: /asset/i })).getByRole("checkbox", {
        name: /read/i,
      }),
    ).toHaveAttribute("data-checked");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("limits available permissions to the union of built-in role permissions", () => {
    const customOnlyRole: Role = {
      id: "8f74bc56-0ac3-47ef-b7e6-8df2c42fb3d1",
      name: "session-reader",
      permissions: [
        {
          resource: PermissionResource.Session,
          verb: PermissionVerb.Read,
        },
      ],
    };
    const permissions = getAvailableRolePermissions([ROLE_FIXTURES[0], customOnlyRole]);

    expect(permissions).toEqual(expect.arrayContaining(ROLE_FIXTURES[0].permissions));
    expect(permissions).not.toContainEqual(customOnlyRole.permissions[0]);
  });

  it("shows validation errors after submitting an empty create form", async () => {
    const user = userEvent.setup();

    render(<Create />);

    await user.click(screen.getByRole("button", { name: /create role/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });

  it("submits selected permissions grouped by resource", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <RoleForm
        mode="create"
        availablePermissions={getAvailableRolePermissions(ROLE_FIXTURES)}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/^name$/i), "security-analyst");
    await clickPermission(user, /asset/i, /read/i);
    await clickPermission(user, /asset/i, /write/i);
    await clickPermission(user, /finding/i, /read/i);
    await user.click(screen.getByRole("button", { name: /create role/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "security-analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read,
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Write,
          },
          {
            resource: PermissionResource.Finding,
            verb: PermissionVerb.Read,
          },
        ],
      });
    });
  });

  it("allows submitting zero permissions", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <RoleForm
        mode="create"
        availablePermissions={getAvailableRolePermissions(ROLE_FIXTURES)}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/^name$/i), "no-access");
    await user.click(screen.getByRole("button", { name: /create role/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "no-access",
        permissions: [],
      });
    });
  });

  it("calls the cancel handler", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <RoleForm
        mode="create"
        availablePermissions={getAvailableRolePermissions(ROLE_FIXTURES)}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it("disables actions while submitting", async () => {
    const user = userEvent.setup();
    let resolveSubmit: () => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <RoleForm
        mode="create"
        availablePermissions={getAvailableRolePermissions(ROLE_FIXTURES)}
        defaultValues={{ name: "security-analyst" }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /create role/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create role/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeDisabled();
    });

    resolveSubmit();
  });

  it("maps form values to deduplicated create and update payloads", () => {
    const duplicatePermissions: Array<Permission> = [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
    ];

    expect(
      mapCreateRoleFormValues({
        name: "  security-analyst  ",
        permissions: duplicatePermissions,
      }),
    ).toEqual({
      name: "security-analyst",
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      ],
    });
    expect(
      mapUpdateRoleFormValues({
        name: "security-analyst",
        permissions: duplicatePermissions,
      }),
    ).toEqual({
      name: "security-analyst",
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
      ],
    });
  });

  it("maps existing roles to edit form values", () => {
    expect(mapRoleToFormValues(CUSTOM_AUDITOR_ROLE)).toEqual({
      name: CUSTOM_AUDITOR_ROLE.name,
      permissions: mapCreateRoleFormValues({
        name: CUSTOM_AUDITOR_ROLE.name,
        permissions: CUSTOM_AUDITOR_ROLE.permissions,
      }).permissions,
    });
  });

  it("deduplicates permissions before grouping them", () => {
    expect(
      groupAvailableRolePermissions([
        { resource: PermissionResource.User, verb: PermissionVerb.Read },
        { resource: PermissionResource.User, verb: PermissionVerb.Read },
        { resource: PermissionResource.User, verb: PermissionVerb.Write },
      ]),
    ).toEqual([
      {
        resource: PermissionResource.User,
        permissions: [
          { resource: PermissionResource.User, verb: PermissionVerb.Read },
          { resource: PermissionResource.User, verb: PermissionVerb.Write },
        ],
      },
    ]);
  });
});
