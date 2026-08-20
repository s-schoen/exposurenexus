import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import type { Asset } from "@exposurenexus/types/model/asset";
import type { Finding } from "@exposurenexus/types/model/finding";
import type { ReactNode } from "react";

interface QueryState<TData> {
  data?: TData;
  isPending: boolean;
  isSuccess: boolean;
}

interface QueryOptionsLike {
  queryKey: ReadonlyArray<unknown>;
}

const findingId = "3703bd68-5d5e-4209-90dc-365bc7030f67";

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
  const finding: Finding = {
    id: "3703bd68-5d5e-4209-90dc-365bc7030f67",
    assetId: "61303e6e-9aa5-49cc-a863-bc1bd6eb45ac",
    title: "Missing MFA enforcement",
    severity: "high" as Finding["severity"],
    status: "confirmed" as Finding["status"],
    mitigation: null,
    assigneeId: null,
    dueDate: null,
    weakness: { identifiers: {} },
    affectedResource: { type: "unspecified" as AffectedResourceType.Unspecified },
    vulnerabilities: [],
    observationCount: 0,
    observingSources: [],
    firstSeen: null,
    lastSeen: null,
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
  const assetQuery: QueryState<Asset> = {
    data: asset,
    isPending: false,
    isSuccess: true,
  };
  const findingQuery: QueryState<Finding> = {
    data: finding,
    isPending: false,
    isSuccess: true,
  };

  return {
    asset,
    assetQuery,
    finding,
    findingQuery,
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
  useQuery: (options: QueryOptionsLike) => {
    if (options.queryKey[0] === "findings") {
      return mocks.findingQuery;
    }

    if (options.queryKey[0] === "assets") {
      return mocks.assetQuery;
    }

    throw new Error(`Unhandled query key ${String(options.queryKey[0])}`);
  },
}));

vi.mock("@/api/asset.ts", () => ({
  createAssetByIDQueryOptions: (id: string) => ({
    queryKey: ["assets", id],
  }),
}));

vi.mock("@/api/finding.ts", () => ({
  createFindingByIDQueryOptions: (id: string) => ({
    queryKey: ["findings", id],
  }),
}));

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/components/finding-detail-content.tsx", () => ({
  FindingDetailContent: ({
    findingId: renderedFindingId,
    titleAction,
  }: {
    findingId: string;
    titleAction?: ReactNode;
  }) => (
    <div>
      {titleAction}
      <div>Finding detail for {renderedFindingId}</div>
    </div>
  ),
}));

describe("FindingDetailPage", () => {
  beforeEach(() => {
    mocks.assetQuery = {
      data: mocks.asset,
      isPending: false,
      isSuccess: true,
    };
    mocks.findingQuery = {
      data: mocks.finding,
      isPending: false,
      isSuccess: true,
    };
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("uses loaded finding and asset data for page metadata and renders the back link", async () => {
    const { FindingDetailPage } =
      await import("@/features/findings/components/finding-detail-page.tsx");

    render(<FindingDetailPage findingId={findingId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Missing MFA enforcement",
      description: "Confirmed finding on Payment API",
    });
    expect(screen.getByRole("link", { name: /back to findings/i })).toHaveAttribute(
      "href",
      "/findings",
    );
    expect(screen.getByText(`Finding detail for ${findingId}`)).toBeVisible();
  });

  it("uses fallback page metadata before finding data is available", async () => {
    const { FindingDetailPage } =
      await import("@/features/findings/components/finding-detail-page.tsx");
    mocks.findingQuery = {
      isPending: true,
      isSuccess: false,
    };
    mocks.assetQuery = {
      isPending: true,
      isSuccess: false,
    };

    render(<FindingDetailPage findingId={findingId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Finding",
      description: "Inspect, update, and triage a specific finding.",
    });
  });

  it("uses fallback description while the finding asset is loading", async () => {
    const { FindingDetailPage } =
      await import("@/features/findings/components/finding-detail-page.tsx");
    mocks.assetQuery = {
      isPending: true,
      isSuccess: false,
    };

    render(<FindingDetailPage findingId={findingId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Missing MFA enforcement",
      description: "Inspect, update, and triage a specific finding.",
    });
  });
});
