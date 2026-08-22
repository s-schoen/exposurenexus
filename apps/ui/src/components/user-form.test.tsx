import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserForm, mapCreateUserFormValues, mapUpdateUserFormValues } from "@/components/user-form";
import { ROLE_FIXTURES } from "@/components/user-form.stories";
import * as stories from "@/components/user-form.stories";

import type { UserFormValues } from "@/components/user-form";

const { Create, CustomSubmitLabel, EditPrefilled } = composeStories(stories);

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
HTMLElement.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
});

async function fillCreateFields(user: ReturnType<typeof userEvent.setup>, values: UserFormValues) {
  await user.type(screen.getByLabelText(/display name/i), values.displayName);
  await user.type(screen.getByLabelText(/username/i), values.username);
  await user.type(screen.getByLabelText(/email/i), values.email);
  await user.type(screen.getByLabelText(/password/i), values.password);
}

function getInputByLabel(label: RegExp) {
  const element = screen.getByLabelText(label);

  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Expected input element");
  }

  return element;
}

describe("UserForm", () => {
  it("renders the create-mode inputs and actions", () => {
    render(<Create />);

    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /roles/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /enabled/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create user/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("renders the edit-mode inputs without username", () => {
    render(<EditPrefilled />);

    const displayNameInput = getInputByLabel(/display name/i);
    const emailInput = getInputByLabel(/email/i);
    const passwordInput = getInputByLabel(/password/i);

    expect(displayNameInput).toHaveValue("Alice Example");
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
    expect(emailInput).toHaveValue("alice@example.com");
    expect(screen.getByRole("combobox", { name: /roles/i })).toHaveTextContent("viewer, editor");
    expect(passwordInput).toHaveValue("");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  it("renders a submit button when a custom submit label is provided", () => {
    render(<CustomSubmitLabel />);

    expect(screen.getByRole("button", { name: /update account/i })).toBeInTheDocument();
  });

  it("shows validation errors after submitting an empty create form", async () => {
    const user = userEvent.setup();

    render(<Create />);

    await user.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });

  it("submits entered values including selected roles", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <UserForm
        mode="create"
        roles={ROLE_FIXTURES}
        defaultValues={{ roleIds: [builtInRoleIds.viewer] }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    const values: UserFormValues = {
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "correct horse battery staple",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.admin],
    };

    await fillCreateFields(user, values);
    await user.click(screen.getByRole("combobox", { name: /roles/i }));
    await user.click(await screen.findByRole("option", { name: /admin/i }));
    await user.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(values);
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("filters and clears role selections", async () => {
    const user = userEvent.setup();

    render(<UserForm mode="create" roles={ROLE_FIXTURES} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const rolesCombobox = screen.getByRole("combobox", { name: /roles/i });

    await user.click(rolesCombobox);
    await user.type(screen.getByLabelText(/search roles/i), "admin");
    await user.click(await screen.findByRole("option", { name: /admin/i }));

    expect(rolesCombobox).toHaveTextContent("admin");

    await user.click(screen.getByRole("button", { name: /clear selection/i }));

    expect(rolesCombobox).toHaveTextContent("Select roles...");
  });

  it("calls the cancel handler", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    render(
      <UserForm
        mode="create"
        roles={ROLE_FIXTURES}
        defaultValues={{ roleIds: [builtInRoleIds.viewer] }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it("maps create form values with trimmed identity fields", () => {
    expect(
      mapCreateUserFormValues({
        displayName: "  Alice Example  ",
        username: "  alice  ",
        email: "  alice@example.com  ",
        enabled: true,
        password: "secret",
        roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor],
      }),
    ).toEqual({
      displayName: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      enabled: true,
      password: "secret",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor],
    });
  });

  it("maps update form values without a blank password", () => {
    expect(
      mapUpdateUserFormValues({
        displayName: "  Alice Example  ",
        username: "ignored",
        email: "  alice@example.com  ",
        enabled: true,
        password: "",
        roleIds: [builtInRoleIds.viewer],
      }),
    ).toEqual({
      displayName: "Alice Example",
      email: "alice@example.com",
      enabled: true,
      roleIds: [builtInRoleIds.viewer],
    });
  });

  it("maps update form values with a provided password", () => {
    expect(
      mapUpdateUserFormValues({
        displayName: "Alice Example",
        username: "ignored",
        email: "alice@example.com",
        enabled: false,
        password: "secret",
        roleIds: [builtInRoleIds.admin],
      }),
    ).toEqual({
      displayName: "Alice Example",
      email: "alice@example.com",
      enabled: false,
      password: "secret",
      roleIds: [builtInRoleIds.admin],
    });
  });
});
