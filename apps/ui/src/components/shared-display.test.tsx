import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { ReactNode } from "react";

interface QueryState {
  data?: Asset;
  isLoading: boolean;
}

const mocks = vi.hoisted(() => ({
  assetQuery: {
    data: {
      id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      displayName: "api-01",
      type: "host" as Asset["type"],
      environment: "production" as Asset["environment"],
      lifecycleState: "active" as Asset["lifecycleState"],
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    },
    isLoading: false,
  } as QueryState,
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  queryOptions: (options: unknown) => options,
  useQuery: () => mocks.assetQuery,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    disabled,
    params,
  }: {
    children: ReactNode;
    disabled?: boolean;
    params: { id: string };
  }) => (
    <a aria-disabled={disabled ? "true" : "false"} href={`/assets/${params.id}`}>
      {children}
      <span className="sr-only">Open asset</span>
    </a>
  ),
}));

vi.mock("@/features/assets/queries/assets.ts", () => ({
  createAssetByIDQueryOptions: (id: string) => ({
    queryKey: ["assets", id],
  }),
  createListAssetsQueryOptions: () => ({
    queryKey: ["assets"],
  }),
  createListAssetsWithCustomFieldsQueryOptions: () => ({
    queryKey: ["assets", "with-custom-fields"],
  }),
}));

beforeEach(() => {
  mocks.assetQuery = {
    data: {
      id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      displayName: "api-01",
      type: "host" as Asset["type"],
      environment: "production" as Asset["environment"],
      lifecycleState: "active" as Asset["lifecycleState"],
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    },
    isLoading: false,
  };
});

afterEach(() => {
  cleanup();
});

describe("shared display components", () => {
  it("renders timestamps and invalid date fallbacks", async () => {
    const { Timestamp } = await import("@/components/timestamp.tsx");
    const { rerender } = render(<Timestamp timestamp={new Date("2026-01-02T03:04:05.000Z")} />);

    const time = document.querySelector("time");

    expect(time).toBeTruthy();
    expect(time?.textContent).toContain("2026");
    expect(time?.tagName.toLowerCase()).toBe("time");
    expect(time?.getAttribute("datetime")).toBe("2026-01-02T03:04:05.000Z");

    rerender(<Timestamp timestamp="not-a-date" />);

    expect(screen.getByText("Invalid date")).toBeTruthy();
  });

  it("renders detail highlight labels and values", async () => {
    const { DetailHighlightCard } = await import("@/components/detail-highlight-card.tsx");

    render(
      <DetailHighlightCard
        label="CVE"
        value="Not assigned"
        description="External identifier when available"
      />,
    );

    expect(screen.getByText("CVE")).toBeTruthy();
    expect(screen.getByText("Not assigned")).toBeTruthy();
    expect(screen.getByText("External identifier when available")).toBeTruthy();
  });

  it("renders asset info loading and loaded states", async () => {
    const { AssetInfoItem } = await import("@/features/assets");
    mocks.assetQuery = {
      isLoading: true,
    };

    const { container, rerender } = render(
      <AssetInfoItem assetId="447b53a7-c3ce-4a0c-b96a-099f5e5dc71c" />,
    );

    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: /open asset/i }).getAttribute("aria-disabled")).toBe(
      "true",
    );

    mocks.assetQuery = {
      data: {
        id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
        displayName: "api-01",
        type: "containerImage" as Asset["type"],
        environment: "production" as Asset["environment"],
        lifecycleState: "active" as Asset["lifecycleState"],
        ownerId: null,
        identifiers: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
        updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      },
      isLoading: false,
    };
    rerender(<AssetInfoItem assetId="447b53a7-c3ce-4a0c-b96a-099f5e5dc71c" />);

    expect(screen.getByText("api-01")).toBeTruthy();
    expect(screen.getByText("ContainerImage")).toBeTruthy();
    expect(screen.getByRole("link", { name: /open asset/i }).getAttribute("href")).toBe(
      "/assets/447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    );
  });
});
