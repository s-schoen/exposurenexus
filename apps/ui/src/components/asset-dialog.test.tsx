import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

const selectMocks = vi.hoisted(() => ({
  onValueChange: undefined as undefined | ((value: string) => void),
  value: ""
}))

vi.mock("@/components/ui/select.tsx", () => ({
  Select: ({
    children,
    onValueChange,
    value
  }: {
    children: ReactNode
    onValueChange?: (value: string) => void
    value?: string
  }) => {
    selectMocks.onValueChange = onValueChange
    selectMocks.value = value ?? ""

    return <div>{children}</div>
  },
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <button
      type="button"
      role="option"
      onClick={() => selectMocks.onValueChange?.(value)}
    >
      {children}
    </button>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button" role="combobox">
      {children}
    </button>
  ),
  SelectValue: () => (
    <span>
      {selectMocks.value === AssetType.Container
        ? "Container"
        : selectMocks.value === AssetType.Software
          ? "Software"
          : "Host"}
    </span>
  )
}))

beforeEach(() => {
  selectMocks.onValueChange = undefined
  selectMocks.value = ""
})

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
    expect(screen.getByRole("combobox").textContent).toContain("Host")
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
    fireEvent.click(screen.getByRole("combobox"))
    fireEvent.click(await screen.findByRole("option", { name: "Container" }))
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

  it("does not resolve when submitted without a name", async () => {
    const { call, container } = renderAssetDialog()

    fireEvent.submit(container.querySelector("#asset-form")!)
    await waitFor(() => {
      expect(call.end).not.toHaveBeenCalled()
    })
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0)
  })
})
