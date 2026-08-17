import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/types/model/affected-resource";
import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity, VulnerabilityType } from "@exposurenexus/types/model/vulnerability";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FindingDetailContent } from "@/components/finding-detail-content.tsx";

import type { Asset } from "@exposurenexus/types/model/asset";
import type { FindingProjection } from "@exposurenexus/types/model/finding";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { ReactNode } from "react";

const ids = {
  asset: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  user: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
  finding: "2713d833-eb13-4517-ac7c-7761545ed42a",
};

const asset: Asset = {
  id: ids.asset,
  displayName: "web-01",
  type: AssetType.Host,
  environment: AssetEnvironment.Production,
  lifecycleState: AssetLifecycleState.Active,
  ownerId: ids.user,
  identifiers: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
};

const user: UserProfile = {
  id: ids.user,
  username: "robin",
  displayName: "Robin Owner",
  email: "robin@example.com",
  enabled: true,
  roleIds: [],
};

const finding: FindingProjection = {
  id: ids.finding,
  assetId: ids.asset,
  title: "Exposed Admin Endpoint",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Confirmed,
  assigneeId: null,
  dueDate: null,
  mitigation: "Restrict administrative access to trusted networks.",
  weakness: { identifiers: { cwe: ["CWE-200"], nuclei: ["admin-panel"] } },
  affectedResource: {
    type: AffectedResourceType.WebEndpoint,
    scheme: "https",
    host: "example.com",
    port: 443,
    path: "/admin",
    component: { kind: WebEndpointComponentKind.Endpoint },
  },
  vulnerabilities: [
    {
      id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      type: VulnerabilityType.Cve,
      identifier: "CVE-2026-0001",
      title: "Example endpoint exposure",
      description: null,
      severity: VulnerabilitySeverity.High,
      metadata: null,
      createdBy: ids.user,
      updatedBy: ids.user,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    {
      id: "4fb566c6-e642-48d8-b70d-418efb074f8d",
      type: VulnerabilityType.Cwe,
      identifier: "CWE-200",
      title: "Exposure of Sensitive Information",
      description: null,
      severity: VulnerabilitySeverity.Medium,
      metadata: null,
      createdBy: ids.user,
      updatedBy: ids.user,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  ],
  observationCount: 4,
  observingSources: [ObservationSource.Manual, ObservationSource.Nuclei],
  firstSeen: new Date("2026-01-02T00:00:00.000Z"),
  lastSeen: new Date("2026-01-05T00:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
};

const mocks = vi.hoisted(() => ({
  findingQuery: undefined as
    | { data?: FindingProjection; isPending: boolean; isSuccess: boolean; error?: Error }
    | undefined,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: Array<string> }) => {
    if (options.queryKey?.[0] === "findings") return mocks.findingQuery;
    if (options.queryKey?.[0] === "assets") {
      return { data: asset, isPending: false, isSuccess: true };
    }
    return { data: [user], isPending: false, isSuccess: true };
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/api/asset.ts", () => ({
  createAssetByIDQueryOptions: (id: string) => ({ queryKey: ["assets", id] }),
}));

vi.mock("@/api/finding.ts", () => ({
  createFindingByIDQueryOptions: (id: string) => ({ queryKey: ["findings", id] }),
}));

vi.mock("@/api/user.ts", () => ({
  createListUsersQueryOptions: () => ({ queryKey: ["users"] }),
}));

vi.mock("@/components/asset-info-item.tsx", () => ({
  AssetInfoItem: () => <div>Asset information</div>,
}));

vi.mock("@/components/detail-query-boundary.tsx", () => ({
  DetailQueryBoundary: ({
    children,
    query,
    title,
  }: {
    children: (value: FindingProjection) => ReactNode;
    query: typeof mocks.findingQuery;
    title: string;
  }) => (query?.data ? <>{children(query.data)}</> : <div>{title}</div>),
}));

vi.mock("@/components/user-label.tsx", () => ({
  createUserProfileById: (users: Array<UserProfile> | undefined) =>
    new Map((users ?? []).map((profile) => [profile.id, profile])),
  UserLabel: ({
    user: profile,
    emptyLabel = "No User",
  }: {
    user?: UserProfile | null;
    emptyLabel?: string;
  }) => <span>{profile?.displayName ?? emptyLabel}</span>,
}));

describe("FindingDetailContent", () => {
  beforeEach(() => {
    mocks.findingQuery = { data: finding, isPending: false, isSuccess: true };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders finding-owned data, summaries, weakness, resource, and equal catalog links", () => {
    render(<FindingDetailContent findingId={finding.id} />);

    expect(screen.getByText(finding.title)).toBeTruthy();
    expect(screen.getByText("CWE-200")).toBeTruthy();
    expect(screen.getByText("admin-panel")).toBeTruthy();
    expect(screen.getByText("Web endpoint")).toBeTruthy();
    expect(screen.getByText("https")).toBeTruthy();
    expect(screen.getByText("manual, nuclei")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Example endpoint exposure")).toBeTruthy();
    expect(screen.getByText("Exposure of Sensitive Information")).toBeTruthy();
    expect(screen.getByText("Restrict administrative access to trusted networks.")).toBeTruthy();
    expect(screen.queryByText("Evidence")).toBeNull();
  });

  it("renders empty observation and catalog summaries without placeholder dates", () => {
    mocks.findingQuery = {
      data: {
        ...finding,
        vulnerabilities: [],
        observationCount: 0,
        observingSources: [],
        firstSeen: null,
        lastSeen: null,
      },
      isPending: false,
      isSuccess: true,
    };

    render(<FindingDetailContent findingId={finding.id} />);

    expect(screen.getAllByText("None observed").length).toBeGreaterThan(0);
    expect(screen.getByText("No catalog entries are linked.")).toBeTruthy();
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
  });

  it("renders a missing finding boundary while the query is pending", () => {
    mocks.findingQuery = { isPending: true, isSuccess: false };

    render(<FindingDetailContent findingId={finding.id} />);

    expect(screen.getByText("Finding details")).toBeTruthy();
  });
});
