import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { Asset } from "@exposurenexus/types/model/asset"

interface QueryState<TData> {
  data?: TData
  isPending: boolean
  isSuccess: boolean
}

const assetId = "61303e6e-9aa5-49cc-a863-bc1bd6eb45ac"

const mocks = vi.hoisted(() => {
  const asset: Asset = {
    id: "61303e6e-9aa5-49cc-a863-bc1bd6eb45ac",
    name: "Payment API",
    type: "host" as Asset["type"],
    ownerId: null
  }
  const assetQuery: QueryState<Asset> = {
    data: asset,
    isPending: false,
    isSuccess: true
  }

  return {
    asset,
    assetQuery,
    usePageMeta: vi.fn()
  }
})

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    to
  }: {
    children: ReactNode
    className?: string
    to: string
  }) => (
    <a className={className} href={to}>
      {children}
    </a>
  )
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.assetQuery
}))

vi.mock("@/api/asset.ts", () => ({
  createAssetByIDQueryOptions: (id: string) => ({
    queryKey: ["assets", id]
  })
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/components/asset-detail-content.tsx", () => ({
  AssetDetailContent: ({
    assetId: renderedAssetId,
    titleAction
  }: {
    assetId: string
    titleAction?: ReactNode
  }) => (
    <div>
      {titleAction}
      <div>Asset detail for {renderedAssetId}</div>
    </div>
  )
}))

describe("AssetDetailRouteComponent", () => {
  beforeEach(() => {
    mocks.assetQuery = {
      data: mocks.asset,
      isPending: false,
      isSuccess: true
    }
    mocks.usePageMeta.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("uses loaded asset data for page metadata and renders the back link", async () => {
    const { AssetDetailRouteComponent } = await import(
      "@/routes/_authenticated/assets/-detail-route-component.tsx"
    )

    render(<AssetDetailRouteComponent assetId={assetId} />)

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Payment API",
      description:
        "Inspect the selected asset and review its core inventory metadata."
    })
    expect(screen.getByRole("link", { name: /back to assets/i })).toHaveAttribute(
      "href",
      "/assets"
    )
    expect(screen.getByText(`Asset detail for ${assetId}`)).toBeVisible()
  })

  it("uses fallback page metadata before asset data is available", async () => {
    const { AssetDetailRouteComponent } = await import(
      "@/routes/_authenticated/assets/-detail-route-component.tsx"
    )
    mocks.assetQuery = {
      isPending: true,
      isSuccess: false
    }

    render(<AssetDetailRouteComponent assetId={assetId} />)

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Asset",
      description:
        "Inspect the selected asset and review its core inventory metadata."
    })
  })
})
