import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ConfirmDialog } from "@/components/confirm-dialog.tsx"

afterEach(() => {
  cleanup()
})

function renderConfirmDialog(
  props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}
) {
  const call = {
    ended: false,
    end: vi.fn()
  }

  render(
    <ConfirmDialog
      call={call as never}
      message="Delete this record?"
      {...props}
    />
  )

  return call
}

describe("ConfirmDialog", () => {
  it("renders default copy and resolves true when confirmed", () => {
    const call = renderConfirmDialog()

    expect(screen.getByRole("heading", { name: "Confirm" })).toBeTruthy()
    expect(screen.getByText("Delete this record?")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "type",
      "button"
    )

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    expect(call.end).toHaveBeenCalledWith(true)
    expect(call.end).toHaveBeenCalledTimes(1)
  })

  it("renders custom copy and resolves false when cancelled", () => {
    const call = renderConfirmDialog({
      cancelText: "Keep",
      confirmText: "Delete",
      description: "This action cannot be undone.",
      message: "Delete api-01?",
      title: "Delete asset"
    })

    expect(screen.getByText("Delete asset")).toBeTruthy()
    expect(screen.getByText("This action cannot be undone.")).toBeTruthy()
    expect(screen.getByText("Delete api-01?")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Keep" }))

    expect(call.end).toHaveBeenCalledWith(false)
    expect(call.end).toHaveBeenCalledTimes(1)
  })

  it("applies destructive intent to the confirm action", () => {
    renderConfirmDialog({
      confirmText: "Delete",
      confirmVariant: "destructive"
    })

    const confirmButton = screen.getByRole("button", { name: "Delete" })

    expect(confirmButton).toHaveProperty("type", "button")
    expect(confirmButton.className).toContain("text-destructive")
  })
})
