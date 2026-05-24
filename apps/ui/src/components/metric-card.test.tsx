import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"
import * as stories from "@/components/metric-card.stories"

const { Default, Loading, Panel, WithoutIcon } = composeStories(stories)

afterEach(() => {
  cleanup()
})

describe("MetricCard stories", () => {
  it("renders the primary card metric", () => {
    render(<Default />)

    expect(screen.getByText("Critical / high")).toBeVisible()
    expect(screen.getByText("12")).toBeVisible()
    expect(screen.getByText("Highest severity exposure right now")).toBeVisible()
  })

  it("renders the panel metric variant", () => {
    render(<Panel />)

    expect(screen.getByText("Mitigated rate")).toBeVisible()
    expect(screen.getByText("84%")).toBeVisible()
    expect(screen.getByText("Share of findings already mitigated")).toBeVisible()
  })

  it("renders loading placeholders instead of metric values", () => {
    const { container } = render(<Loading />)

    expect(screen.getByText("Critical / high")).toBeVisible()
    expect(screen.queryByText("12")).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })

  it("renders content when the icon is hidden", () => {
    render(<WithoutIcon />)

    expect(screen.getByText("Affected assets")).toBeVisible()
    expect(screen.getByText("37")).toBeVisible()
    expect(screen.getByText("Assets with at least one linked finding")).toBeVisible()
  })
})
