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

import * as stories from "@/components/role-table/index.stories"

const { ActiveRow, Default, Empty, Loading } = composeStories(stories)

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock
window.HTMLElement.prototype.scrollIntoView = vi.fn()

afterEach(() => {
  cleanup()
})

describe("RoleTable stories", () => {
  it("renders the default roles table state", async () => {
    render(<Default />)

    await waitFor(() => {
      expect(screen.getByText("viewer")).toBeTruthy()
      expect(screen.getByText("security-auditor")).toBeTruthy()
      expect(screen.getAllByText("Built-in").length).toBeGreaterThan(0)
      expect(screen.getByText("Custom")).toBeTruthy()
    })
  })

  it("renders loading skeleton rows", async () => {
    const { container } = render(<Loading />)

    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-slot="skeleton"]').length
      ).toBeGreaterThan(0)
    })
  })

  it("renders the empty-state placeholder", async () => {
    render(<Empty />)

    await waitFor(() => {
      expect(screen.getByText("No results to show")).toBeTruthy()
    })
  })

  it("marks the active row", async () => {
    const { container } = render(<ActiveRow />)

    await waitFor(() => {
      const activeRow = container.querySelector('tr[data-active="true"]')

      expect(activeRow).toBeTruthy()
      expect(
        within(activeRow as HTMLTableRowElement).getByText("admin")
      ).toBeTruthy()
    })
  })

  it("filters rows from the type select filter and clears correctly", async () => {
    render(<Default />)

    const typeFilterButton = screen
      .getAllByRole("button", { name: /type/i })
      .find((button) => button.getAttribute("aria-haspopup") === "dialog")

    expect(typeFilterButton).toBeTruthy()
    fireEvent.click(typeFilterButton!)

    const customOptions = await screen.findAllByText("Custom")
    fireEvent.click(customOptions.at(-1) as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText("security-auditor")).toBeTruthy()
      expect(screen.queryByText("viewer")).toBeNull()
      expect(screen.getByText("Filters active")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))

    await waitFor(() => {
      expect(screen.getByText("viewer")).toBeTruthy()
      expect(screen.getByText("security-auditor")).toBeTruthy()
      expect(screen.queryByText("Filters active")).toBeNull()
    })
  })
})
