import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"
import { builtInRoleIds } from "@openvlp/types/model/rbac"
import type { UserFormValues } from "@/components/user-form"
import { ROLE_FIXTURES } from "@/components/user-form.stories"

import * as stories from "@/components/user-form.stories"
import {
  UserForm,
  mapCreateUserFormValues,
  mapUpdateUserFormValues
} from "@/components/user-form"

const { Create, CustomSubmitLabel, EditPrefilled } = composeStories(stories)

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
HTMLElement.prototype.scrollIntoView = vi.fn()

afterEach(() => {
  cleanup()
})

function fillCreateFields(values: UserFormValues) {
  fireEvent.change(screen.getByLabelText(/display name/i), {
    target: { value: values.displayUsername }
  })
  fireEvent.change(screen.getByLabelText(/username/i), {
    target: { value: values.username }
  })
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: values.email }
  })
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: values.password }
  })
}

function getInputByLabel(label: RegExp) {
  const element = screen.getByLabelText(label)

  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Expected input element")
  }

  return element
}

describe("UserForm", () => {
  it("renders the create-mode inputs and actions", () => {
    render(<Create />)

    expect(screen.getByLabelText(/display name/i)).toBeTruthy()
    expect(screen.getByLabelText(/username/i)).toBeTruthy()
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByRole("combobox", { name: /roles/i })).toBeTruthy()
    expect(screen.getByLabelText(/password/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /create user/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy()
  })

  it("renders the edit-mode inputs without username", () => {
    render(<EditPrefilled />)

    const displayNameInput = getInputByLabel(/display name/i)
    const emailInput = getInputByLabel(/email/i)
    const passwordInput = getInputByLabel(/password/i)

    expect(displayNameInput.value).toBe("Alice Example")
    expect(screen.queryByLabelText(/username/i)).toBeNull()
    expect(emailInput.value).toBe("alice@example.com")
    expect(screen.getByRole("combobox", { name: /roles/i }).textContent).toContain(
      "viewer, editor"
    )
    expect(passwordInput.value).toBe("")
    expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy()
  })

  it("renders a submit button when a custom submit label is provided", () => {
    render(<CustomSubmitLabel />)

    expect(screen.getByRole("button", { name: /update account/i })).toBeTruthy()
  })

  it("shows validation errors after submitting an empty create form", async () => {
    render(<Create />)

    fireEvent.click(screen.getByRole("button", { name: /create user/i }))

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0)
    })
  })

  it("submits entered values including selected roles", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    render(
      <UserForm
        mode="create"
        roles={ROLE_FIXTURES}
        defaultValues={{ roleIds: [builtInRoleIds.viewer] }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )

    const values: UserFormValues = {
      displayUsername: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      password: "correct horse battery staple",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.admin]
    }

    fillCreateFields(values)
    fireEvent.click(screen.getByRole("combobox", { name: /roles/i }))
    fireEvent.click(screen.getByText("admin"))
    fireEvent.click(screen.getByRole("button", { name: /create user/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(onSubmit).toHaveBeenCalledWith(values)
    })
  })

  it("filters and clears role selections", () => {
    render(
      <UserForm
        mode="create"
        roles={ROLE_FIXTURES}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("combobox", { name: /roles/i }))
    fireEvent.change(screen.getByPlaceholderText(/search roles/i), {
      target: { value: "admin" }
    })
    fireEvent.click(screen.getByText("admin"))

    expect(screen.getByRole("combobox", { name: /roles/i }).textContent).toContain(
      "admin"
    )

    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }))

    expect(screen.getByRole("combobox", { name: /roles/i }).textContent).toContain(
      "Select roles..."
    )
  })

  it("calls the cancel handler", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    render(
      <UserForm
        mode="create"
        roles={ROLE_FIXTURES}
        defaultValues={{ roleIds: [builtInRoleIds.viewer] }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })

  it("maps create form values with trimmed identity fields", () => {
    expect(
      mapCreateUserFormValues({
        displayUsername: "  Alice Example  ",
        username: "  alice  ",
        email: "  alice@example.com  ",
        password: "secret",
        roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
      })
    ).toEqual({
      name: "Alice Example",
      displayUsername: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      password: "secret",
      roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
    })
  })

  it("maps update form values without a blank password", () => {
    expect(
      mapUpdateUserFormValues(
        {
          displayUsername: "  Alice Example  ",
          username: "ignored",
          email: "  alice@example.com  ",
          password: "",
          roleIds: [builtInRoleIds.viewer]
        },
        "avatar.png"
      )
    ).toEqual({
      name: "Alice Example",
      displayUsername: "Alice Example",
      email: "alice@example.com",
      image: "avatar.png",
      roleIds: [builtInRoleIds.viewer]
    })
  })

  it("maps update form values with a provided password", () => {
    expect(
      mapUpdateUserFormValues({
        displayUsername: "Alice Example",
        username: "ignored",
        email: "alice@example.com",
        password: "secret",
        roleIds: [builtInRoleIds.admin]
      })
    ).toEqual({
      name: "Alice Example",
      displayUsername: "Alice Example",
      email: "alice@example.com",
      image: null,
      password: "secret",
      roleIds: [builtInRoleIds.admin]
    })
  })
})
