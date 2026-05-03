import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { AssetType } from "@openvlp/types/model/asset"
import { AssetDialog } from "@/components/asset-dialog.tsx"

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
        type: AssetType.Host
      })
    })
  })

  it("does not resolve when submitted without a name", async () => {
    const { call, container } = renderAssetDialog()

    fireEvent.submit(container.querySelector("#asset-form")!)
    await waitFor(() => {
      expect(call.end).not.toHaveBeenCalled()
    })
  })
})
