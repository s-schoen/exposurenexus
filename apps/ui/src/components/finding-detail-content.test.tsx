import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FindingDetailContent } from "@/components/finding-detail-content.tsx";

import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { ReactNode } from "react";

const ids = {
  asset: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  user: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
  finding: "2713d833-eb13-4517-ac7c-7761545ed42a",
  disabledUser: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
  availableVulnerability: "79c335ea-7004-4c96-aefa-4b72375b5668",
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

const disabledUser: UserProfile = {
  ...user,
  id: ids.disabledUser,
  username: "casey",
  displayName: "Casey Disabled",
  email: "casey@example.com",
  enabled: false,
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
  linkVulnerability: vi.fn(),
  unlinkVulnerability: vi.fn(),
  confirm: vi.fn(),
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
      return {
        data: [
          ...finding.vulnerabilities,
          {
            ...finding.vulnerabilities[0],
            id: ids.availableVulnerability,
            identifier: "CVE-2026-0002",
            title: "Available catalog entry",
          },
        ],
        isPending: false,
        isSuccess: true,
      };
    }
    return { data: [user, disabledUser], isPending: false, isSuccess: true };
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/assets", () => ({
  createAssetByIDQueryOptions: (id: string) => ({ queryKey: ["assets", id] }),
  AssetInfoItem: () => <div>Asset information</div>,
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

vi.mock("@/features/users", () => ({
  createListUsersQueryOptions: () => ({ queryKey: ["users"] }),
  createUserProfileById: (users: Array<UserProfile> | undefined) =>
    new Map((users ?? []).map((profile) => [profile.id, profile])),
  getUserProfileDisplayName: (profile: UserProfile) => profile.displayName,
  UserLabel: ({
    userId,
    user: profile,
    emptyLabel = "No User",
    unknownLabel = "Unknown User",
  }: {
    userId?: string | null;
    user?: UserProfile | null;
    emptyLabel?: string;
    unknownLabel?: string;
  }) => <span>{profile?.displayName ?? (userId ? unknownLabel : emptyLabel)}</span>,
}));

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    correctFinding: mocks.correctFinding,
    linkVulnerability: mocks.linkVulnerability,
    unlinkVulnerability: mocks.unlinkVulnerability,
  }),
}));

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: { call: mocks.confirm },
}));

vi.mock("@/hooks/use-observation-lifecycle.ts", () => ({
  useObservationLifecycle: () => ({ addObservation: vi.fn() }),
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

describe("FindingDetailContent", () => {
  beforeEach(() => {
    mocks.correctFinding.mockReset();
    mocks.correctFinding.mockResolvedValue(finding);
    mocks.linkVulnerability.mockReset();
    mocks.linkVulnerability.mockResolvedValue(finding);
    mocks.unlinkVulnerability.mockReset();
    mocks.unlinkVulnerability.mockResolvedValue(finding);
    mocks.confirm.mockReset();
    mocks.confirm.mockResolvedValue(true);
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

    expect(mocks.correctFinding).toHaveBeenCalledWith(finding.id, {
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

  it("submits a complete correction and supports disabled assignees and due-date changes", async () => {
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);
    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    await actor.clear(screen.getByLabelText("Title"));
    await actor.type(screen.getByLabelText("Title"), "Corrected endpoint");
    await actor.click(screen.getByLabelText("Severity"));
    await actor.click(screen.getByRole("option", { name: "Critical" }));
    await actor.click(screen.getByLabelText("Status"));
    await actor.click(screen.getByRole("option", { name: "Mitigated" }));
    await actor.click(screen.getByLabelText("Assignee"));
    await actor.click(screen.getByRole("option", { name: "Casey Disabled" }));
    await actor.type(screen.getByLabelText("Due date"), "2026-06-30");
    await actor.clear(screen.getByLabelText("Mitigation"));
    await actor.type(screen.getByLabelText("Mitigation"), "Deploy the corrected policy.");
    await actor.clear(screen.getByLabelText("Weakness identifiers"));
    await actor.type(screen.getByLabelText("Weakness identifiers"), "cwe=CWE-284");
    await actor.click(screen.getByLabelText("Affected resource type"));
    await actor.click(screen.getByRole("option", { name: "Cloud resource" }));
    await actor.type(screen.getByLabelText("Provider"), "aws");
    await actor.type(screen.getByLabelText("Resource ID"), "arn:aws:s3:::admin-data");
    await actor.click(screen.getByRole("button", { name: "Save correction" }));

    expect(mocks.correctFinding).toHaveBeenCalledWith(finding.id, {
      title: "Corrected endpoint",
      severity: VulnerabilitySeverity.Critical,
      status: FindingStatus.Mitigated,
      assigneeId: ids.disabledUser,
      dueDate: new Date("2026-06-30T00:00:00.000Z"),
      mitigation: "Deploy the corrected policy.",
      weakness: { identifiers: { cwe: ["CWE-284"] } },
      affectedResource: {
        type: AffectedResourceType.CloudResource,
        provider: "aws",
        resourceId: "arn:aws:s3:::admin-data",
      },
    });
  });

  it("resets cancelled corrections and supports clearing assignment and due date", async () => {
    mocks.findingQuery = {
      data: {
        ...finding,
        assigneeId: ids.disabledUser,
        dueDate: new Date("2026-06-30T00:00:00.000Z"),
      },
      isPending: false,
      isSuccess: true,
    };
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);
    expect(screen.getByText("Casey Disabled")).toBeTruthy();
    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    await actor.clear(screen.getByLabelText("Title"));
    await actor.type(screen.getByLabelText("Title"), "Discarded title");
    await actor.click(screen.getByRole("button", { name: "Cancel" }));
    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    expect(screen.getByLabelText("Title")).toHaveValue(finding.title);
    await actor.click(screen.getByLabelText("Assignee"));
    await actor.click(screen.getByRole("option", { name: "Unassigned" }));
    await actor.clear(screen.getByLabelText("Due date"));
    await actor.click(screen.getByRole("button", { name: "Save correction" }));

    expect(mocks.correctFinding).toHaveBeenCalledWith(
      finding.id,
      expect.objectContaining({ assigneeId: null, dueDate: null }),
    );
  });

  it("shows unknown assignees without losing the edit path", async () => {
    mocks.findingQuery = {
      data: { ...finding, assigneeId: "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12" },
      isPending: false,
      isSuccess: true,
    };
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);

    expect(screen.getByText("Unknown Assignee")).toBeTruthy();
    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    expect(screen.getByRole("dialog", { name: "Correct finding" })).toBeTruthy();
  });

  it("links and unlinks catalog entries with confirmation and retained selection on failure", async () => {
    mocks.linkVulnerability.mockResolvedValueOnce(null).mockResolvedValueOnce(finding);
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);
    await actor.click(screen.getByLabelText("Link catalog entry"));
    await actor.click(await screen.findByRole("option", { name: /CVE: CVE-2026-0002/ }));
    await actor.click(screen.getByRole("button", { name: "Link entry" }));
    expect(mocks.linkVulnerability).toHaveBeenCalledWith(finding.id, ids.availableVulnerability);
    expect(screen.getByLabelText("Link catalog entry")).toHaveTextContent("CVE-2026-0002");
    await actor.click(screen.getByRole("button", { name: "Link entry" }));
    expect(mocks.linkVulnerability).toHaveBeenCalledTimes(2);

    await actor.click(screen.getAllByRole("button", { name: "Unlink" })[0]);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Unlink" }));
    expect(mocks.unlinkVulnerability).toHaveBeenCalledWith(
      finding.id,
      finding.vulnerabilities[0].id,
    );
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

  it("prevents cancellation and duplicate correction while submission is pending", async () => {
    let resolve!: (value: Finding) => void;
    mocks.correctFinding.mockReturnValueOnce(
      new Promise((promiseResolve) => {
        resolve = promiseResolve;
      }),
    );
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);
    await actor.click(screen.getByRole("button", { name: "Edit finding" }));
    const submit = screen.getByRole("button", { name: "Save correction" });
    await actor.click(submit);

    expect(submit).toBeDisabled();
    await actor.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Correct finding" })).toBeTruthy();
    await actor.click(submit);
    expect(mocks.correctFinding).toHaveBeenCalledTimes(1);

    resolve(finding);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Correct finding" })).toBeNull(),
    );
  });

  it("does not unlink when confirmation is cancelled", async () => {
    mocks.confirm.mockResolvedValueOnce(false);
    const actor = userEvent.setup();
    render(<FindingDetailContent findingId={finding.id} />);

    await actor.click(screen.getAllByRole("button", { name: "Unlink" })[0]);

    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.unlinkVulnerability).not.toHaveBeenCalled();
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
