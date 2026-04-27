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

import * as stories from "@/components/asset-custom-field-table/index.stories"

const { ActiveRow, Creatable, Default, Empty, Loading } =
  composeStories(stories)

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
window.HTMLElement.prototype.scrollIntoView = vi.fn()

afterEach(() => {
  cleanup()
})

describe("AssetCustomFieldTable stories", () => {
  it("renders the default custom fields table state", async () => {
    render(<Default />)

    await waitFor(() => {
      expect(screen.getByText("Category")).toBeTruthy()
      expect(screen.getByText("Priority")).toBeTruthy()
      expect(screen.getByText("Environment")).toBeTruthy()
      expect(screen.getByText("Production")).toBeTruthy()
      expect(screen.getByText("2 options")).toBeTruthy()
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
        within(activeRow as HTMLTableRowElement).getByText("Environment")
      ).toBeTruthy()
    })
  })

  it("renders the toolbar create action", async () => {
    render(<Creatable />)

    const createButton = await screen.findByRole("button", {
      name: /new custom field/i
    })
    fireEvent.click(createButton)

    await waitFor(() => {
      expect(stories.Creatable.args?.onCreateCustomField).toHaveBeenCalled()
    })
  })

  it("filters rows from the type select filter and clears correctly", async () => {
    render(<Default />)

    const typeFilterButton = screen
      .getAllByRole("button", { name: /type/i })
      .find((button) => button.getAttribute("aria-haspopup") === "dialog")

    expect(typeFilterButton).toBeTruthy()
    fireEvent.click(typeFilterButton!)

    const selectOptions = await screen.findAllByText("Select")
    fireEvent.click(selectOptions.at(-1) as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText("Environment")).toBeTruthy()
      expect(screen.queryByText("Category")).toBeNull()
      expect(screen.queryByText("Priority")).toBeNull()
      expect(screen.getByText("Filters active")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))

    await waitFor(() => {
      expect(screen.getByText("Category")).toBeTruthy()
      expect(screen.getByText("Priority")).toBeTruthy()
      expect(screen.getByText("Environment")).toBeTruthy()
      expect(screen.queryByText("Filters active")).toBeNull()
    })
  })

  it("filters rows from the required select filter and clears correctly", async () => {
    render(<Default />)

    const requiredFilterButton = screen
      .getAllByRole("button", { name: /required/i })
      .find((button) => button.getAttribute("aria-haspopup") === "dialog")

    expect(requiredFilterButton).toBeTruthy()
    fireEvent.click(requiredFilterButton!)

    const requiredOptions = await screen.findAllByText("Required")
    fireEvent.click(requiredOptions.at(-1) as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText("Priority")).toBeTruthy()
      expect(screen.getByText("Environment")).toBeTruthy()
      expect(screen.queryByText("Category")).toBeNull()
      expect(screen.getByText("Filters active")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))

    await waitFor(() => {
      expect(screen.getByText("Category")).toBeTruthy()
      expect(screen.getByText("Priority")).toBeTruthy()
      expect(screen.getByText("Environment")).toBeTruthy()
      expect(screen.queryByText("Filters active")).toBeNull()
    })
  })
})
