import { AssetType } from "@exposurenexus/types/model/asset";
import { FindingSource, FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { FindingTable } from "@/components/finding-table/index.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { createLoginRedirects } from "@/lib/login-redirect.ts";
import { routeTree } from "@/routeTree.gen.ts";

import type { Asset } from "@exposurenexus/types/model/asset";
import type { Finding, UpdateFinding } from "@exposurenexus/types/model/finding";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { Meta, StoryObj } from "@storybook/react-vite";

type FindingTableScenario = "default" | "loading" | "empty" | "grouped";

type FindingTableStoryArgs = {
  findings: Array<Finding>;
  assets: Array<Asset>;
  users: Array<UserProfile>;
  scenario: FindingTableScenario;
};

const dayInMs = 24 * 60 * 60 * 1000;

const storyRedirects = createLoginRedirects({
  origin: "http://localhost",
  isKnownRoutePath: () => true,
});

function utcDateOffset(days: number) {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return new Date(today + days * dayInMs);
}

const USERS: Array<UserProfile> = [
  {
    id: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
    username: "robin",
    displayName: "Robin Owner",
    email: "robin@example.com",
    enabled: true,
    roleIds: [],
  },
  {
    id: "7b2b7d98-6242-4efe-b630-5908727103fb",
    username: "alex",
    displayName: "Alex Assignee",
    email: "alex@example.com",
    enabled: true,
    roleIds: [],
  },
  {
    id: "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12",
    username: "casey",
    displayName: "Casey Handler",
    email: "casey@example.com",
    enabled: true,
    roleIds: [],
  },
];

const ASSETS: Array<Asset> = [
  {
    id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    name: "web-01",
    type: AssetType.Host,
    ownerId: USERS[0].id,
  },
  {
    id: "4eaf1ce4-51f4-4a63-80b4-7b550e91050d",
    name: "api-worker",
    type: AssetType.Software,
    ownerId: USERS[2].id,
  },
  {
    id: "5968e90b-5967-4149-b2a7-c4d42f011ccf",
    name: "container-registry",
    type: AssetType.Container,
    ownerId: null,
  },
];

function createFinding({
  id,
  title,
  assetId,
  severity,
  status,
  source,
  assigneeId,
  dueDate,
  firstSeenOffset,
  lastSeenOffset,
}: {
  id: string;
  title: string;
  assetId: string;
  severity: VulnerabilitySeverity;
  status: FindingStatus;
  source: FindingSource;
  assigneeId: string | null;
  dueDate: Date | null;
  firstSeenOffset: number;
  lastSeenOffset: number;
}): Finding {
  const vulnerabilityId = `${id.slice(0, 8)}-${id.slice(9, 13)}-4b8d-9409-06b4b6d74b9a`;

  return {
    id,
    vulnerabilityId,
    severity,
    status,
    source,
    evidence: "Observed during storybook fixture validation.",
    mitigation: "Apply the recommended mitigation and re-run validation.",
    assigneeId,
    dueDate,
    firstSeen: utcDateOffset(firstSeenOffset),
    lastSeen: utcDateOffset(lastSeenOffset),
    fingerprint: `storybook-${id}`,
    assetId,
    createdBy: USERS[0].id,
    updatedBy: USERS[1].id,
    createdAt: utcDateOffset(firstSeenOffset),
    updatedAt: utcDateOffset(lastSeenOffset),
    vulnerability: {
      id: vulnerabilityId,
      title,
      severity,
      description: `${title} detected in the storybook dataset.`,
      cwe: 284,
      cve: null,
      createdBy: USERS[0].id,
      updatedBy: USERS[1].id,
      createdAt: utcDateOffset(firstSeenOffset),
      updatedAt: utcDateOffset(lastSeenOffset),
    },
  };
}

const FINDINGS: Array<Finding> = [
  createFinding({
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    title: "Exposed Admin Endpoint",
    assetId: ASSETS[0].id,
    severity: VulnerabilitySeverity.Critical,
    status: FindingStatus.Active,
    source: FindingSource.Nuclei,
    assigneeId: USERS[1].id,
    dueDate: utcDateOffset(-2),
    firstSeenOffset: -8,
    lastSeenOffset: -1,
  }),
  createFinding({
    id: "9512afc4-d4d3-4fb9-b3be-17ed1529bb45",
    title: "Outdated API Dependency",
    assetId: ASSETS[1].id,
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Confirmed,
    source: FindingSource.Manual,
    assigneeId: USERS[2].id,
    dueDate: utcDateOffset(0),
    firstSeenOffset: -5,
    lastSeenOffset: -1,
  }),
  createFinding({
    id: "832f8b2c-97c5-4f88-85e8-eec4218b7507",
    title: "Unsigned Container Image",
    assetId: ASSETS[2].id,
    severity: VulnerabilitySeverity.Medium,
    status: FindingStatus.Active,
    source: FindingSource.Nuclei,
    assigneeId: null,
    dueDate: utcDateOffset(5),
    firstSeenOffset: -4,
    lastSeenOffset: -2,
  }),
  createFinding({
    id: "5fa080ad-d2f1-41ca-a6bb-18c6d3f6080f",
    title: "Missing MFA Enforcement",
    assetId: ASSETS[0].id,
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Inactive,
    source: FindingSource.Manual,
    assigneeId: USERS[1].id,
    dueDate: utcDateOffset(-7),
    firstSeenOffset: -14,
    lastSeenOffset: -7,
  }),
  createFinding({
    id: "609d1425-66f6-4216-912a-d216c25a06a5",
    title: "Legacy Endpoint Missing Rate Limiting",
    assetId: ASSETS[1].id,
    severity: VulnerabilitySeverity.Low,
    status: FindingStatus.RiskAccepted,
    source: FindingSource.Manual,
    assigneeId: null,
    dueDate: null,
    firstSeenOffset: -22,
    lastSeenOffset: -9,
  }),
];

function FindingTableStoryShell({ findings, assets, users, scenario }: FindingTableStoryArgs) {
  const effectiveFindings = scenario === "empty" ? [] : findings;
  const findingsRef = useRef(effectiveFindings);
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
      },
    });

    if (scenario !== "loading") {
      client.setQueryData(["findings"], effectiveFindings);
      client.setQueryData(["assets"], assets);
      client.setQueryData(["users"], users);
    }

    return client;
  }, [assets, effectiveFindings, scenario, users]);
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: ["/findings"],
        }),
        context: {
          auth: undefined!,
          page: undefined!,
          redirects: storyRedirects,
          queryClient,
        },
      }),
    [queryClient],
  );
  const [ready, setReady] = useState(scenario !== "loading");

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    findingsRef.current = effectiveFindings;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      if (scenario === "loading" && requestUrl.endsWith("/api/findings")) {
        return await new Promise<Response>(() => {});
      }

      if (requestUrl.endsWith("/api/findings")) {
        return createArrayResponse(findingsRef.current);
      }

      if (requestUrl.endsWith("/api/assets")) {
        return createArrayResponse(assets);
      }

      if (requestUrl.endsWith("/api/users")) {
        return createArrayResponse(users);
      }

      if (requestUrl.endsWith("/api/findings/stats")) {
        return createObjectResponse({
          total: findingsRef.current.length,
          status: {},
          severity: {},
          source: {},
          assets: {},
        });
      }

      const findingId = requestUrl.match(/\/api\/findings\/([^/?]+)$/)?.[1];

      if (findingId) {
        const finding = findingsRef.current.find((item) => item.id === findingId);

        if (!finding) {
          return new Response(JSON.stringify({ error: "Finding not found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }

        if (method === "DELETE") {
          findingsRef.current = findingsRef.current.filter((item) => item.id !== findingId);
          queryClient.setQueryData(["findings"], findingsRef.current);

          return createObjectResponse(finding);
        }

        if (method === "PUT") {
          const update = JSON.parse(String(init?.body ?? "{}")) as UpdateFinding;
          const updatedFinding = {
            ...finding,
            ...update,
            dueDate: update.dueDate ? new Date(update.dueDate) : null,
            updatedAt: new Date(),
          };

          findingsRef.current = findingsRef.current.map((item) =>
            item.id === findingId ? updatedFinding : item,
          );
          queryClient.setQueryData(["findings"], findingsRef.current);

          return createObjectResponse(updatedFinding);
        }

        return createObjectResponse(finding);
      }

      return originalFetch(input, init);
    };

    setReady(true);

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [assets, effectiveFindings, queryClient, scenario, users]);

  if (!ready) {
    return null;
  }

  return (
    <RouterContextProvider router={router}>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>
          <ConfirmDialog.Root />
          <Toaster />
          <div className="w-full">
            <FindingTable
              initialGrouping={scenario === "grouped" ? ["status"] : []}
              selectedFindingId={effectiveFindings[0]?.id}
            />
          </div>
        </NuqsAdapter>
      </QueryClientProvider>
    </RouterContextProvider>
  );
}

function createObjectResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createArrayResponse(data: Array<unknown>): Response {
  return new Response(JSON.stringify({ data: { items: data } }), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

const meta = {
  title: "Resources/Findings/Table",
  component: FindingTableStoryShell,
  tags: ["!test"],
  parameters: {
    layout: "padded",
  },
  args: {
    findings: FINDINGS,
    assets: ASSETS,
    users: USERS,
    scenario: "default",
  },
  render: (args) => <FindingTableStoryShell {...args} />,
} satisfies Meta<typeof FindingTableStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const GroupedByStatus: Story = {
  args: {
    scenario: "grouped",
  },
};

export const Empty: Story = {
  args: {
    scenario: "empty",
  },
};

export const Loading: Story = {
  args: {
    scenario: "loading",
  },
};
