import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
  it("renders default copy and resolves true when confirmed", async () => {
    const user = userEvent.setup()
    const call = renderConfirmDialog()

    expect(screen.getByRole("heading", { name: "Confirm" })).toBeInTheDocument()
    expect(screen.getByText("Delete this record?")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "type",
      "button"
    )

    await user.click(screen.getByRole("button", { name: "Confirm" }))

    expect(call.end).toHaveBeenCalledWith(true)
    expect(call.end).toHaveBeenCalledTimes(1)
  })

  it("renders custom copy and resolves false when cancelled", async () => {
    const user = userEvent.setup()
    const call = renderConfirmDialog({
      cancelText: "Keep",
      confirmText: "Delete",
      description: "This action cannot be undone.",
      message: "Delete api-01?",
      title: "Delete asset"
    })

    expect(screen.getByText("Delete asset")).toBeInTheDocument()
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument()
    expect(screen.getByText("Delete api-01?")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Keep" }))

    expect(call.end).toHaveBeenCalledWith(false)
    expect(call.end).toHaveBeenCalledTimes(1)
  })

  it("applies destructive intent to the confirm action", () => {
    renderConfirmDialog({
      confirmText: "Delete",
      confirmVariant: "destructive"
    })

    const confirmButton = screen.getByRole("button", { name: "Delete" })

    expect(confirmButton).toHaveAttribute("type", "button")
    expect(confirmButton).toHaveClass("text-destructive")
  })
})
