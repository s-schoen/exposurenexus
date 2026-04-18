import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"
import type { UserFormValues } from "@/components/user-form"

import * as stories from "@/components/user-form.stories"
import {
  UserForm,
  mapCreateUserFormValues,
  mapUpdateUserFormValues,
} from "@/components/user-form"

const { Create, CustomSubmitLabel, EditPrefilled } = composeStories(stories)

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
    const { container } = render(<Create />)

    expect(screen.getByLabelText(/display name/i)).toBeTruthy()
    expect(screen.getByLabelText(/username/i)).toBeTruthy()
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByLabelText(/password/i)).toBeTruthy()
    expect(container.querySelector('button[type="submit"]')).toBeTruthy()
    expect(container.querySelector('button[type="button"]')).toBeTruthy()
  })

  it("renders the edit-mode inputs without username", () => {
    const { container } = render(<EditPrefilled />)
    const displayNameInput = getInputByLabel(/display name/i)
    const emailInput = getInputByLabel(/email/i)
    const passwordInput = getInputByLabel(/password/i)

    expect(displayNameInput.value).toBe("Alice Example")
    expect(screen.queryByLabelText(/username/i)).toBeNull()
    expect(emailInput.value).toBe("alice@example.com")
    expect(passwordInput.value).toBe("")
    expect(container.querySelector('button[type="submit"]')).toBeTruthy()
    expect(container.querySelector('button[type="button"]')).toBeTruthy()
  })

  it("renders a submit button when a custom submit label is provided", () => {
    const { container } = render(<CustomSubmitLabel />)

    expect(container.querySelector('button[type="submit"]')).toBeTruthy()
  })

  it("shows validation errors after submitting an empty create form", async () => {
    const { container } = render(<Create />)

    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0)
    })
  })

  it("submits entered values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    const { container } = render(
      <UserForm
        mode="create"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )

    const values: UserFormValues = {
      displayUsername: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      password: "correct horse battery staple"
    }

    fillCreateFields(values)
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(onSubmit).toHaveBeenCalledWith(values)
    })
  })

  it("calls the cancel handler", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    const { container } = render(
      <UserForm
        mode="create"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )

    const cancelButton = container.querySelector(
      'button[type="button"]'
    ) as HTMLButtonElement

    fireEvent.click(cancelButton)

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
        password: "secret"
      })
    ).toEqual({
      name: "Alice Example",
      displayUsername: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      password: "secret"
    })
  })

  it("maps update form values without a blank password", () => {
    expect(
      mapUpdateUserFormValues(
        {
          displayUsername: "  Alice Example  ",
          username: "ignored",
          email: "  alice@example.com  ",
          password: ""
        },
        "avatar.png"
      )
    ).toEqual({
      name: "Alice Example",
      displayUsername: "Alice Example",
      email: "alice@example.com",
      image: "avatar.png"
    })
  })

  it("maps update form values with a provided password", () => {
    expect(
      mapUpdateUserFormValues({
        displayUsername: "Alice Example",
        username: "ignored",
        email: "alice@example.com",
        password: "secret"
      })
    ).toEqual({
      name: "Alice Example",
      displayUsername: "Alice Example",
      email: "alice@example.com",
      image: null,
      password: "secret"
    })
  })
})
