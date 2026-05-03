import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  locationPathname: "/",
  statsQuery: {
    data: {
      status: {
        active: 7,
        confirmed: 3
      }
    }
  }
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.statsQuery
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => ({
    pathname: mocks.locationPathname
  })
}))

vi.mock("@/api/finding.ts", () => ({
  createFindingStatsQueryOptions: () => ({
    queryKey: ["findings", "stats"]
  })
}))

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: ReactNode }) => <nav>{children}</nav>,
  SidebarContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroupLabel: ({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  ),
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuButton: ({
    isActive,
    render: renderedLink
  }: {
    isActive: boolean
    render: ReactNode
  }) => (
    <div data-active={isActive ? "true" : "false"} data-testid="nav-item">
      {renderedLink}
    </div>
  ),
  SidebarMenuItem: ({ children }: { children: ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarSeparator: () => <hr />
}))

async function renderSidebar(pathname = "/") {
  const { AppSidebar } = await import("@/components/app-sidebar.tsx")
  mocks.locationPathname = pathname

  return render(<AppSidebar />)
}

function activeItemText() {
  const activeItem = screen
    .getAllByTestId("nav-item")
    .find((item) => item.dataset.active === "true")

  if (!activeItem) {
    throw new Error("No active sidebar item")
  }

  return activeItem.textContent
}

describe("AppSidebar", () => {
  beforeEach(() => {
    mocks.locationPathname = "/"
    mocks.statsQuery = {
      data: {
        status: {
          active: 7,
          confirmed: 3
        }
      }
    }
  })

  afterEach(() => {
    cleanup()
  })

  it("renders navigation groups, labels, links, and finding statistic badges", async () => {
    await renderSidebar()

    expect(screen.getByText("Explore")).toBeTruthy()
    expect(screen.getByText("Manage")).toBeTruthy()

    for (const label of [
      "Dashboard",
      "Assets",
      "Triage queue",
      "Findings",
      "Vulnerabilities",
      "Users",
      "Roles",
      "Custom Fields",
      "Import"
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }

    expect(screen.getByText("Overview and triage")).toBeTruthy()
    expect(screen.getByText("Active findings to review")).toBeTruthy()
    expect(screen.getByText("Issues with your assets")).toBeTruthy()
    expect(screen.getByText("7")).toBeTruthy()
    expect(screen.getByText("3")).toBeTruthy()
    expect(screen.getByRole("link", { name: /triage queue/i })).toHaveProperty(
      "pathname",
      "/findings/triage"
    )
    expect(screen.getByRole("link", { name: /import/i })).toHaveProperty(
      "pathname",
      "/findings/import"
    )
  })

  it.each([
    ["/", "Dashboard"],
    ["/assets/447b53a7-c3ce-4a0c-b96a-099f5e5dc71c", "Assets"],
    ["/findings/triage", "Triage queue"],
    ["/findings", "Findings"],
    ["/findings/2713d833-eb13-4517-ac7c-7761545ed42a", "Findings"],
    ["/vulnerabilities/9d7acdd0-fad1-46c9-8218-1793f421f0fe", "Vulnerabilities"],
    ["/users/7b413aba-5164-456b-8ffd-88fb6b99bbed", "Users"],
    ["/roles/admin", "Roles"],
    ["/custom-fields/environment", "Custom Fields"],
    ["/findings/import", "Import"]
  ])("marks %s as active for %s", async (pathname, expectedTitle) => {
    await renderSidebar(pathname)

    expect(activeItemText()).toContain(expectedTitle)
  })

  it("does not render zero finding statistic badges", async () => {
    mocks.statsQuery = {
      data: {
        status: {
          active: 0,
          confirmed: 0
        }
      }
    }

    await renderSidebar()

    expect(screen.queryByText("0")).toBeNull()
  })
})
