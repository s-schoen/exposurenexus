import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"

afterEach(() => {
  cleanup()
})

function renderDetailPreviewDialog(
  props: Partial<Parameters<typeof DetailPreviewDialog>[0]> = {}
) {
  const onClose = vi.fn()

  render(
    <DetailPreviewDialog
      title="Asset details"
      description="Inspect the selected asset."
      onClose={onClose}
      {...props}
    >
      <div>Selected content</div>
    </DetailPreviewDialog>
  )

  return onClose
}

describe("DetailPreviewDialog", () => {
  it("does not render dialog content when closed", () => {
    renderDetailPreviewDialog()

    expect(screen.queryByText("Selected content")).toBeNull()
    expect(screen.queryByRole("link", { name: /open full page/i })).toBeNull()
  })

  it("renders content and the default full-page link when open", () => {
    renderDetailPreviewDialog({
      fullPageHref: "/assets/asset-1",
      selectedId: "asset-1"
    })

    const link = screen.getByRole("link", { name: /open full page/i })

    expect(screen.getByText("Selected content")).toBeTruthy()
    expect(link.getAttribute("href")).toBe("/assets/asset-1")
  })

  it("renders a custom full-page link label", () => {
    renderDetailPreviewDialog({
      fullPageHref: "/assets/asset-1",
      fullPageLabel: "Open asset",
      selectedId: "asset-1"
    })

    expect(screen.getByRole("link", { name: /open asset/i })).toBeTruthy()
  })

  it("calls onClose when the dialog close control closes it", () => {
    const onClose = renderDetailPreviewDialog({
      selectedId: "asset-1"
    })

    fireEvent.click(screen.getByRole("button", { name: /close/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
