import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { ReactNode } from "react";

interface QueryState<TData> {
  data?: TData;
  isPending: boolean;
  isSuccess: boolean;
}

const assetId = "61303e6e-9aa5-49cc-a863-bc1bd6eb45ac";

const mocks = vi.hoisted(() => {
  const asset: Asset = {
    id: "61303e6e-9aa5-49cc-a863-bc1bd6eb45ac",
    displayName: "Payment API",
    type: "host" as Asset["type"],
    environment: "production" as Asset["environment"],
    lifecycleState: "active" as Asset["lifecycleState"],
    ownerId: null,
    identifiers: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
  };
  const assetQuery: QueryState<Asset> = {
    data: asset,
    isPending: false,
    isSuccess: true,
  };

  return {
    asset,
    assetQuery,
    usePageMeta: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.assetQuery,
}));

vi.mock("@/api/asset.ts", () => ({
  createAssetByIDQueryOptions: (id: string) => ({
    queryKey: ["assets", id],
  }),
}));

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/components/asset-detail-content.tsx", () => ({
  AssetDetailContent: ({
    assetId: renderedAssetId,
    titleAction,
  }: {
    assetId: string;
    titleAction?: ReactNode;
  }) => (
    <div>
      {titleAction}
      <div>Asset detail for {renderedAssetId}</div>
    </div>
  ),
}));

describe("AssetDetailPage", () => {
  beforeEach(() => {
    mocks.assetQuery = {
      data: mocks.asset,
      isPending: false,
      isSuccess: true,
    };
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("uses loaded asset data for page metadata and renders the back link", async () => {
    const { AssetDetailPage } = await import("@/features/assets/components/asset-detail-page.tsx");

    render(<AssetDetailPage assetId={assetId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Payment API",
      description: "Inspect the selected asset and review its core inventory metadata.",
    });
    expect(screen.getByRole("link", { name: /back to assets/i })).toHaveAttribute(
      "href",
      "/assets",
    );
    expect(screen.getByText(`Asset detail for ${assetId}`)).toBeVisible();
  });

  it("uses fallback page metadata before asset data is available", async () => {
    const { AssetDetailPage } = await import("@/features/assets/components/asset-detail-page.tsx");
    mocks.assetQuery = {
      isPending: true,
      isSuccess: false,
    };

    render(<AssetDetailPage assetId={assetId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Asset",
      description: "Inspect the selected asset and review its core inventory metadata.",
    });
  });
});
