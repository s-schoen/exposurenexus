import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"
import * as stories from "@/components/asset-info-item.stories"
import { STORY_ASSETS } from "@/components/storybook-fixtures.ts"

const { Loaded, Loading } = composeStories(stories)
const primaryAsset = STORY_ASSETS[0]

afterEach(() => {
  cleanup()
})

describe("AssetInfoItem stories", () => {
  it("renders loaded asset identity and detail navigation", async () => {
    render(<Loaded />)

    await waitFor(() => {
      expect(screen.getByText(primaryAsset.name)).toBeVisible()
      expect(screen.getByText("Host")).toBeVisible()
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        `/assets/${primaryAsset.id}`
      )
    })
  })

  it("renders loading placeholders while the asset query is pending", async () => {
    const { container } = render(<Loading />)

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
      expect(screen.queryByText(primaryAsset.name)).not.toBeInTheDocument()
    })
  })
})
