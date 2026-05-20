import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SafeMarkdown } from "@/components/safe-markdown.tsx"

afterEach(() => {
  cleanup()
})

describe("SafeMarkdown", () => {
  it("renders Markdown and GFM formatting", () => {
    const { container } = render(
      <SafeMarkdown>{`# Impact

Administrative interface is **reachable**.

\`\`\`http
GET /admin HTTP/1.1
\`\`\`

| Key | Value |
| --- | --- |
| Port | 8443 |
`}</SafeMarkdown>
    )

    expect(screen.getByRole("heading", { name: "Impact" })).toBeTruthy()
    expect(screen.getByText("reachable")).toBeTruthy()
    expect(container.querySelector("pre code")?.textContent).toContain(
      "GET /admin HTTP/1.1"
    )
    expect(screen.getByRole("table")).toBeTruthy()
    expect(screen.getByText("Port")).toBeTruthy()
    expect(screen.getByText("8443")).toBeTruthy()
  })

  it("allows details and summary raw HTML layout", () => {
    const { container } = render(
      <SafeMarkdown>{`<details open><summary>Request</summary>

\`\`\`
GET /admin HTTP/1.1
\`\`\`

</details>`}</SafeMarkdown>
    )

    const details = container.querySelector("details")
    const summary = container.querySelector("summary")

    expect(details).toBeTruthy()
    expect(details?.hasAttribute("open")).toBe(true)
    expect(summary?.textContent).toBe("Request")
    expect(container.querySelector("pre code")?.textContent).toContain(
      "GET /admin HTTP/1.1"
    )
  })

  it("strips active content and unsafe attributes", () => {
    const { container } = render(
      <SafeMarkdown>{`<p onclick="alert(1)" style="color:red">Keep me</p>
<script>alert("xss")</script>
<style>body { color: red; }</style>`}</SafeMarkdown>
    )

    const paragraph = screen.getByText("Keep me").closest("p")

    expect(paragraph?.getAttribute("onclick")).toBeNull()
    expect(paragraph?.getAttribute("style")).toBeNull()
    expect(screen.queryByText(/xss/)).toBeNull()
    expect(screen.queryByText(/color: red/)).toBeNull()
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("style")).toBeNull()
  })

  it("blocks unsafe link protocols", () => {
    render(
      <SafeMarkdown>
        {`[unsafe](javascript:alert(1)) [safe](https://example.com) [mail](mailto:security@example.com) [relative](/findings)`}
      </SafeMarkdown>
    )

    expect(screen.getByText("unsafe").closest("a")?.hasAttribute("href")).toBe(
      false
    )
    expect(screen.getByText("safe").closest("a")?.getAttribute("href")).toBe(
      "https://example.com"
    )
    expect(screen.getByText("mail").closest("a")?.getAttribute("href")).toBe(
      "mailto:security@example.com"
    )
    expect(
      screen.getByText("relative").closest("a")?.getAttribute("href")
    ).toBe("/findings")
  })

  it("strips images and checkbox inputs", () => {
    const { container } = render(
      <SafeMarkdown>{`![alt text](https://example.com/x.png)

- [x] done

<input type="checkbox" checked />`}</SafeMarkdown>
    )

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("input")).toBeNull()
    expect(screen.queryByAltText("alt text")).toBeNull()
    expect(screen.getByText("done")).toBeTruthy()
  })
})
