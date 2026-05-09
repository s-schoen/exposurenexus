import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"
import {
  PermissionResource,
  PermissionVerb
} from "@exposurenexus/types/model/rbac"
import type { Permission, Role } from "@exposurenexus/types/model/rbac"
import * as stories from "@/components/role-form.stories"
import {
  RoleForm,
  getAvailableRolePermissions,
  groupAvailableRolePermissions,
  mapCreateRoleFormValues,
  mapRoleToFormValues,
  mapUpdateRoleFormValues
} from "@/components/role-form"
import { CUSTOM_AUDITOR_ROLE, ROLE_FIXTURES } from "@/components/role-fixtures.ts"

const { Create, EditPrefilled } = composeStories(stories)

afterEach(() => {
  cleanup()
})

function getInputByLabel(label: RegExp) {
  const element = screen.getByLabelText(label)

  if (!(element instanceof HTMLInputElement)) {
    throw new Error("Expected input element")
  }

  return element
}

function clickPermission(resource: RegExp, verb: RegExp) {
  const group = screen.getByRole("group", { name: resource })
  fireEvent.click(within(group).getByRole("checkbox", { name: verb }))
}

describe("RoleForm", () => {
  it("renders create-mode defaults and groups available permissions", () => {
    render(<Create />)

    expect(getInputByLabel(/^name$/i).value).toBe("")
    expect(screen.getByRole("group", { name: /asset/i })).toBeTruthy()
    expect(screen.getByRole("group", { name: /finding/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /create role/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy()
  })

  it("renders edit-mode defaults", () => {
    render(<EditPrefilled />)

    expect(getInputByLabel(/^name$/i).value).toBe(CUSTOM_AUDITOR_ROLE.name)
    expect(
      within(screen.getByRole("group", { name: /asset/i }))
        .getByRole("checkbox", { name: /read/i })
        .hasAttribute("data-checked")
    ).toBe(true)
    expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy()
  })

  it("limits available permissions to the union of built-in role permissions", () => {
    const customOnlyRole: Role = {
      id: "8f74bc56-0ac3-47ef-b7e6-8df2c42fb3d1",
      name: "session-reader",
      permissions: [
        {
          resource: PermissionResource.Session,
          verb: PermissionVerb.Read
        }
      ]
    }
    const permissions = getAvailableRolePermissions([
      ROLE_FIXTURES[0],
      customOnlyRole
    ])

    expect(permissions).toEqual(
      expect.arrayContaining(ROLE_FIXTURES[0].permissions)
    )
    expect(permissions).not.toContainEqual(customOnlyRole.permissions[0])
  })

  it("shows validation errors after submitting an empty create form", async () => {
    render(<Create />)

    fireEvent.click(screen.getByRole("button", { name: /create role/i }))

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0)
    })
  })

  it("submits selected permissions grouped by resource", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <RoleForm
        mode="create"
        availablePermissions={getAvailableRolePermissions(ROLE_FIXTURES)}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "security-analyst" }
    })
    clickPermission(/asset/i, /read/i)
    clickPermission(/asset/i, /write/i)
    clickPermission(/finding/i, /read/i)
    fireEvent.click(screen.getByRole("button", { name: /create role/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "security-analyst",
        permissions: [
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Read
          },
          {
            resource: PermissionResource.Asset,
            verb: PermissionVerb.Write
          },
          {
            resource: PermissionResource.Finding,
            verb: PermissionVerb.Read
          }
        ]
      })
    })
  })

  it("allows submitting zero permissions", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <RoleForm
        mode="create"
        availablePermissions={getAvailableRolePermissions(ROLE_FIXTURES)}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "no-access" }
    })
    fireEvent.click(screen.getByRole("button", { name: /create role/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "no-access",
        permissions: []
      })
    })
  })

  it("calls the cancel handler", async () => {
    const onCancel = vi.fn()

    render(
      <RoleForm
        mode="create"
        availablePermissions={getAvailableRolePermissions(ROLE_FIXTURES)}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })

  it("disables actions while submitting", async () => {
    let resolveSubmit: () => void = () => undefined
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        })
    )

    render(
      <RoleForm
        mode="create"
        availablePermissions={getAvailableRolePermissions(ROLE_FIXTURES)}
        defaultValues={{ name: "security-analyst" }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /create role/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create role/i })).toHaveProperty(
        "disabled",
        true
      )
      expect(screen.getByRole("button", { name: /^cancel$/i })).toHaveProperty(
        "disabled",
        true
      )
    })

    resolveSubmit()
  })

  it("maps form values to deduplicated create and update payloads", () => {
    const duplicatePermissions: Array<Permission> = [
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
      { resource: PermissionResource.Asset, verb: PermissionVerb.Write }
    ]

    expect(
      mapCreateRoleFormValues({
        name: "  security-analyst  ",
        permissions: duplicatePermissions
      })
    ).toEqual({
      name: "security-analyst",
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write }
      ]
    })
    expect(
      mapUpdateRoleFormValues({
        name: "security-analyst",
        permissions: duplicatePermissions
      })
    ).toEqual({
      name: "security-analyst",
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write }
      ]
    })
  })

  it("maps existing roles to edit form values", () => {
    expect(mapRoleToFormValues(CUSTOM_AUDITOR_ROLE)).toEqual({
      name: CUSTOM_AUDITOR_ROLE.name,
      permissions: mapCreateRoleFormValues({
        name: CUSTOM_AUDITOR_ROLE.name,
        permissions: CUSTOM_AUDITOR_ROLE.permissions
      }).permissions
    })
  })

  it("deduplicates permissions before grouping them", () => {
    expect(
      groupAvailableRolePermissions([
        { resource: PermissionResource.User, verb: PermissionVerb.Read },
        { resource: PermissionResource.User, verb: PermissionVerb.Read },
        { resource: PermissionResource.User, verb: PermissionVerb.Write }
      ])
    ).toEqual([
      {
        resource: PermissionResource.User,
        permissions: [
          { resource: PermissionResource.User, verb: PermissionVerb.Read },
          { resource: PermissionResource.User, verb: PermissionVerb.Write }
        ]
      }
    ])
  })
})
