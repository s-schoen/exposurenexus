import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { AssetType } from "@openvlp/types/model/asset"
import type { ReactNode } from "react"
import { AssetDialog } from "@/components/asset-dialog.tsx"

const queryMocks = vi.hoisted(() => ({
  ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
  users: [
    {
      id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: false,
      roleIds: []
    }
  ]
}))

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: () => ({
    data: queryMocks.users,
    isLoading: false,
    isPending: false
  })
}))

vi.mock("@/components/ui/select.tsx", () => ({
  Select: ({
    children,
    name,
    onValueChange,
    value
  }: {
    children: ReactNode
    name?: string
    onValueChange?: (value: string) => void
    value?: string
  }) => (
    <select
      id={name}
      name={name}
      value={value ?? ""}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null
}))

afterEach(() => {
  cleanup()
})

function renderAssetDialog() {
  const call = {
    ended: false,
    end: vi.fn()
  }

  const view = render(<AssetDialog call={call as never} />)

  return {
    ...view,
    call
  }
}

describe("AssetDialog", () => {
  it("renders default values", () => {
    renderAssetDialog()

    const nameInput = screen.getByLabelText(/^name$/i)

    expect(nameInput).toBeInstanceOf(HTMLInputElement)
    expect((nameInput as HTMLInputElement).value).toBe("")
    expect(screen.getByLabelText(/^type$/i).value).toBe(AssetType.Host)
    expect(screen.getByLabelText(/^owner$/i).value).toBe("__no_owner__")
  })

  it("resolves null when cancelled", () => {
    const { call } = renderAssetDialog()

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    expect(call.end).toHaveBeenCalledWith(null)
  })

  it("submits a valid host asset", async () => {
    const { call, container } = renderAssetDialog()

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "api-01" }
    })
    fireEvent.submit(container.querySelector("#asset-form")!)

    await waitFor(() => {
      expect(call.end).toHaveBeenCalledWith({
        id: "",
        name: "api-01",
        type: AssetType.Host,
        ownerId: null
      })
    })
  })

  it("submits the selected asset type", async () => {
    const { call, container } = renderAssetDialog()

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "container-01" }
    })
    fireEvent.change(screen.getByLabelText(/^type$/i), {
      target: { value: AssetType.Container }
    })
    fireEvent.submit(container.querySelector("#asset-form")!)

    await waitFor(() => {
      expect(call.end).toHaveBeenCalledWith({
        id: "",
        name: "container-01",
        type: AssetType.Container,
        ownerId: null
      })
    })
  })

  it("submits the selected owner", async () => {
    const { call, container } = renderAssetDialog()

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "api-01" }
    })
    fireEvent.change(screen.getByLabelText(/^owner$/i), {
      target: { value: queryMocks.ownerId }
    })
    fireEvent.submit(container.querySelector("#asset-form")!)

    await waitFor(() => {
      expect(call.end).toHaveBeenCalledWith({
        id: "",
        name: "api-01",
        type: AssetType.Host,
        ownerId: queryMocks.ownerId
      })
    })
  })

  it("does not resolve when submitted without a name", async () => {
    const { call, container } = renderAssetDialog()

    fireEvent.submit(container.querySelector("#asset-form")!)
    await waitFor(() => {
      expect(call.end).not.toHaveBeenCalled()
    })
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0)
  })
})
