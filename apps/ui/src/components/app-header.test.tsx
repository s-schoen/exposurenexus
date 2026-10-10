import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("AppHeader", () => {
  it("renders the product brand and account menu slot", async () => {
    const { default: AppHeader } = await import("@/components/app-header.tsx");

    render(<AppHeader accountMenu={<div>Account menu slot</div>} />);

    expect(screen.getByText("ExposureNexus")).toBeTruthy();
    expect(screen.getByAltText("ExposureNexus Logo")).toBeTruthy();
    expect(screen.getByText("Account menu slot")).toBeTruthy();
  });
});
