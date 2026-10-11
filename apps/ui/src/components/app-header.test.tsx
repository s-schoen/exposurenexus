import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AppHeader from "@/components/app-header.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";

describe("AppHeader", () => {
  it("renders the product brand and account menu slot", () => {
    render(
      <SidebarProvider>
        <AppHeader accountMenu={<div>Account menu slot</div>} />
      </SidebarProvider>,
    );

    expect(screen.getByText("ExposureNexus")).toBeVisible();
    expect(screen.getByAltText("ExposureNexus Logo")).toBeVisible();
    expect(screen.getByText("Account menu slot")).toBeVisible();
  });
});
