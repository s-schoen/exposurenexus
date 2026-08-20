import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/types/model/affected-resource";
import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity, VulnerabilityType } from "@exposurenexus/types/model/vulnerability";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FindingDetailContent } from "@/components/finding-detail-content.tsx";

import type { Asset } from "@exposurenexus/types/model/asset";
import type { Finding } from "@exposurenexus/types/model/finding";
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

const finding: Finding = {
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
  firstSeen: new Date("2026-01-02T00:00:00.000Z"),
  lastSeen: new Date("2026-01-05T00:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
};

const mocks = vi.hoisted(() => ({
  correctFinding: vi.fn(),
  findingQuery: undefined as
    | { data?: Finding; isPending: boolean; isSuccess: boolean; error?: Error }
    | undefined,
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: vi.fn(),
  queryOptions: <T extends object>(options: T) => options,
  useQuery: (options: { queryKey?: Array<string> }) => {
    if (options.queryKey?.[2] === "observations") {
      return { data: [], isPending: false, isSuccess: true, isError: false };
    }
    if (options.queryKey?.[0] === "findings") return mocks.findingQuery;
    if (options.queryKey?.[0] === "assets") {
      return { data: asset, isPending: false, isSuccess: true };
    }
    if (options.queryKey?.[0] === "vulnerabilities") {
      return { data: finding.vulnerabilities, isPending: false, isSuccess: true };
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
  createFindingObservationsQueryOptions: (id: string) => ({
    queryKey: ["findings", id, "observations"],
  }),
  createFindingStatsQueryOptions: () => ({ queryKey: ["findings", "stats"] }),
  createListFindingsQueryOptions: () => ({ queryKey: ["findings"] }),
  useLinkFindingVulnerabilityMutation: () => ({ mutateAsync: vi.fn() }),
  useUnlinkFindingVulnerabilityMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/api/user.ts", () => ({
  createListUsersQueryOptions: () => ({ queryKey: ["users"] }),
}));

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    correctFinding: mocks.correctFinding,
    linkVulnerability: vi.fn(),
    unlinkVulnerability: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-observation-lifecycle.ts", () => ({
  useObservationLifecycle: () => ({ addObservation: vi.fn() }),
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
    children: (value: Finding) => ReactNode;
    query: typeof mocks.findingQuery;
    title: string;
  }) => (query?.data ? <>{children(query.data)}</> : <div>{title}</div>),
}));

vi.mock("@/components/user-label.tsx", () => ({
  createUserProfileById: (users: Array<UserProfile> | undefined) =>
    new Map((users ?? []).map((profile) => [profile.id, profile])),
  getUserProfileDisplayName: (profile: UserProfile) => profile.displayName,
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
    mocks.correctFinding.mockReset();
    mocks.correctFinding.mockResolvedValue(finding);
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
        firstSeen: null,
        lastSeen: null,
      },
      isPending: false,
      isSuccess: true,
    };

    render(<FindingDetailContent findingId={finding.id} />);

    expect(screen.getByText("No catalog entries are linked.")).toBeTruthy();
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
  });

  it("renders due dates as UTC calendar dates", () => {
    mocks.findingQuery = {
      data: { ...finding, dueDate: new Date("2026-05-06T00:00:00.000Z") },
      isPending: false,
      isSuccess: true,
    };

    render(<FindingDetailContent findingId={finding.id} />);

    expect(screen.getByText("2026-05-06")).toBeTruthy();
  });

  it("renders a missing finding boundary while the query is pending", () => {
    mocks.findingQuery = { isPending: true, isSuccess: false };

    render(<FindingDetailContent findingId={finding.id} />);

    expect(screen.getByText("Finding details")).toBeTruthy();
  });

  it("opens and cancels the finding correction flow", async () => {
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);

    await actor.click(screen.getByRole("button", { name: "Edit finding" }));

    expect(screen.getByRole("dialog", { name: "Correct finding" })).toBeTruthy();
    expect(screen.getByLabelText("Title")).toHaveValue(finding.title);
    expect(screen.getByLabelText("Weakness identifiers")).toHaveValue(
      "cwe=CWE-200; nuclei=admin-panel",
    );

    await actor.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Correct finding" })).toBeNull();
  });

  it("replaces resource fields when the affected resource type changes", async () => {
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);

    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    await actor.click(screen.getByLabelText("Affected resource type"));
    await actor.click(screen.getByRole("option", { name: "Cloud resource" }));

    expect(screen.getByLabelText("Provider")).toHaveValue("");
    expect(screen.getByLabelText("Provider account")).toHaveValue("");
    expect(screen.getByLabelText("Region")).toHaveValue("");
    expect(screen.getByLabelText("Resource ID")).toHaveValue("");
    expect(screen.getByLabelText("Subresource")).toHaveValue("");
    expect(screen.queryByLabelText("Host")).toBeNull();
    expect(screen.queryByLabelText("Method")).toBeNull();
  });

  it("submits exactly the finding-owned correction payload", async () => {
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);

    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    const title = screen.getByLabelText("Title");
    await actor.clear(title);
    await actor.type(title, "Corrected admin endpoint");
    await actor.click(screen.getByRole("button", { name: "Save correction" }));

    expect(mocks.correctFinding).toHaveBeenCalledWith(finding, {
      title: "Corrected admin endpoint",
      severity: finding.severity,
      status: finding.status,
      assigneeId: finding.assigneeId,
      dueDate: finding.dueDate,
      mitigation: finding.mitigation,
      weakness: finding.weakness,
      affectedResource: finding.affectedResource,
    });
    expect(screen.queryByRole("dialog", { name: "Correct finding" })).toBeNull();
  });

  it("shows validation errors and keeps the correction open", async () => {
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);

    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    await actor.clear(screen.getByLabelText("Title"));
    await actor.click(screen.getByRole("button", { name: "Save correction" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save correction");
    expect(screen.getByRole("dialog", { name: "Correct finding" })).toBeTruthy();
    expect(mocks.correctFinding).not.toHaveBeenCalled();
  });

  it("keeps the correction open when the lifecycle update fails", async () => {
    mocks.correctFinding.mockResolvedValueOnce(null);
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);

    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    await actor.click(screen.getByRole("button", { name: "Save correction" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save correction. Try again.");
    expect(screen.getByRole("dialog", { name: "Correct finding" })).toBeTruthy();
  });

  it("preserves the correction draft when the finding query rerenders", async () => {
    const actor = userEvent.setup();
    const view = render(<FindingDetailContent findingId={finding.id} />);

    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    const title = screen.getByLabelText("Title");
    await actor.clear(title);
    await actor.type(title, "Unsaved correction");

    mocks.findingQuery = {
      data: { ...finding, updatedAt: new Date("2026-01-06T00:00:00.000Z") },
      isPending: false,
      isSuccess: true,
    };
    view.rerender(<FindingDetailContent findingId={finding.id} />);

    expect(screen.getByRole("dialog", { name: "Correct finding" })).toBeTruthy();
    expect(screen.getByLabelText("Title")).toHaveValue("Unsaved correction");
  });
});
