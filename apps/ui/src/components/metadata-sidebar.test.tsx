import { cleanup, render, screen } from "@testing-library/react";
import { ShieldCheck } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import { MetadataSidebar } from "@/components/metadata-sidebar/index.tsx";

afterEach(cleanup);

describe("MetadataSidebar", () => {
  it("renders its title, description, icon, and content", () => {
    const { container } = render(
      <MetadataSidebar
        title="Asset details"
        description="Identity and ownership information"
        icon={ShieldCheck}
      >
        <p>Production gateway</p>
      </MetadataSidebar>,
    );

    expect(screen.getByText("Asset details")).toBeVisible();
    expect(screen.getByText("Identity and ownership information")).toBeVisible();
    expect(screen.getByText("Production gateway")).toBeVisible();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("omits the optional description while keeping the icon and content", () => {
    const { container } = render(
      <MetadataSidebar title="Catalog details" icon={ShieldCheck}>
        <p>CVE-2026-0001</p>
      </MetadataSidebar>,
    );

    expect(screen.getByText("Catalog details")).toBeVisible();
    expect(screen.getByText("CVE-2026-0001")).toBeVisible();
    expect(screen.queryByText("Identity and ownership information")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
