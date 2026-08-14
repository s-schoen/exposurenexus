import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/account-menu", () => ({
  AccountMenu: () => <div>Account menu slot</div>,
}));

describe("AppHeader", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the product brand and account menu slot", async () => {
    const { default: AppHeader } = await import("@/components/app-header.tsx");

    render(<AppHeader />);

    expect(screen.getByText("ExposureNexus")).toBeTruthy();
    expect(screen.getByAltText("ExposureNexus Logo")).toBeTruthy();
    expect(screen.getByText("Account menu slot")).toBeTruthy();
  });
});
