import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"

import * as stories from "@/components/user-label.stories"

const { Default, Loading, RequestFailure } = composeStories(stories)

afterEach(() => {
  cleanup()
})

describe("UserLabel stories", () => {
  it("renders the configured display name in the default state", async () => {
    render(<Default />)

    await waitFor(() => {
      expect(screen.getByText("Alice Example")).toBeTruthy()
    })
  })

  it("renders a skeleton while the query is loading", async () => {
    const { container } = render(<Loading />)

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
    })
  })

  it("renders an empty label when the user cannot be resolved", async () => {
    const { container } = render(<RequestFailure />)

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
      expect(container.textContent).toBe("")
    })
  })
})
