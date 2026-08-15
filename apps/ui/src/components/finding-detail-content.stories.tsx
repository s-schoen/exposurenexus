import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { FindingSource, FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { FindingDetailContent } from "@/components/finding-detail-content.tsx";
import { createLoginRedirects } from "@/lib/login-redirect.ts";
import { routeTree } from "@/routeTree.gen.ts";

import type { Asset } from "@exposurenexus/types/model/asset";
import type { Finding, UpdateFinding } from "@exposurenexus/types/model/finding";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { Meta, StoryObj } from "@storybook/react-vite";

type FindingDetailStoryArgs = {
  finding: Finding;
  asset: Asset;
  users: Array<UserProfile>;
  scenario: "success" | "undated" | "loading" | "error-update";
};

const USERS: Array<UserProfile> = [
  {
    id: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
    username: "robin",
    displayName: "Robin Owner",
    email: "robin@example.com",
    enabled: false,
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

const storyRedirects = createLoginRedirects({
  origin: "http://localhost",
  isKnownRoutePath: () => true,
});

const ASSET: Asset = {
  id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  displayName: "web-01",
  type: AssetType.Host,
  environment: AssetEnvironment.Production,
  lifecycleState: AssetLifecycleState.Active,
  ownerId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  createdBy: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
  updatedBy: "7b2b7d98-6242-4efe-b630-5908727103fb",
};

const FINDING: Finding = {
  id: "2713d833-eb13-4517-ac7c-7761545ed42a",
  vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Confirmed,
  source: FindingSource.Manual,
  evidence:
    "## Validation\n\nScanner reported **remote administrative access**.\n\n```\nGET /admin HTTP/1.1\nHTTP/1.1 200 OK\n```",
  mitigation: "Restrict administrative access to VPN networks.",
  assigneeId: "7b2b7d98-6242-4efe-b630-5908727103fb",
  dueDate: new Date("2026-05-12T00:00:00.000Z"),
  firstSeen: new Date("2026-05-01T09:15:00.000Z"),
  lastSeen: new Date("2026-05-05T16:20:00.000Z"),
  fingerprint: "finding-web-01-admin-endpoint",
  assetId: ASSET.id,
  createdBy: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
  updatedBy: "7b2b7d98-6242-4efe-b630-5908727103fb",
  createdAt: new Date("2026-05-01T09:15:00.000Z"),
  updatedAt: new Date("2026-05-05T16:20:00.000Z"),
  vulnerability: {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description:
      "## Impact\n\nThe administrative interface is reachable from an untrusted network.",
    cwe: 284,
    cve: "CVE-2026-0001",
    createdBy: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
    updatedBy: "7b2b7d98-6242-4efe-b630-5908727103fb",
    createdAt: new Date("2026-04-30T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T08:30:00.000Z"),
  },
};

function FindingDetailContentStoryShell({
  finding,
  asset,
  users,
  scenario,
}: FindingDetailStoryArgs) {
  const effectiveFinding = useMemo(
    () =>
      scenario === "undated"
        ? {
            ...finding,
            dueDate: null,
            status: FindingStatus.Active,
            assigneeId: null,
          }
        : finding,
    [finding, scenario],
  );
  const findingRef = useRef<Finding>(effectiveFinding);
  const assetRef = useRef<Asset>(asset);
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
      client.setQueryData(["findings", effectiveFinding.id], effectiveFinding);
      client.setQueryData(["assets", asset.id], asset);
      client.setQueryData(["users"], users);
    }

    return client;
  }, [asset, effectiveFinding, scenario, users]);
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: [`/findings/${effectiveFinding.id}`],
        }),
        context: {
          auth: undefined!,
          page: undefined!,
          redirects: storyRedirects,
          queryClient,
        },
      }),
    [effectiveFinding.id, queryClient],
  );
  const [ready, setReady] = useState(scenario !== "loading");

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    findingRef.current = effectiveFinding;
    assetRef.current = asset;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (requestUrl.endsWith(`/api/findings/${effectiveFinding.id}`)) {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {});
        }

        if (method === "PUT") {
          if (scenario === "error-update") {
            return new Response(JSON.stringify({ error: "Update failed" }), {
              status: 400,
              headers: {
                "Content-Type": "application/json",
              },
            });
          }

          const update = JSON.parse(
            typeof init?.body === "string" ? init.body : JSON.stringify(init?.body ?? {}),
          ) as UpdateFinding;
          findingRef.current = {
            ...findingRef.current,
            ...update,
            dueDate: update.dueDate ? new Date(update.dueDate) : null,
            updatedAt: new Date(),
          };
          queryClient.setQueryData(["findings", effectiveFinding.id], findingRef.current);

          return createObjectResponse(findingRef.current);
        }

        return createObjectResponse(findingRef.current);
      }

      if (requestUrl.endsWith(`/api/assets/${asset.id}`)) {
        return createObjectResponse(assetRef.current);
      }

      if (requestUrl.endsWith("/api/users")) {
        return createArrayResponse(users);
      }

      return originalFetch(input, init);
    };

    setReady(true);

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [asset, effectiveFinding, queryClient, scenario, users]);

  if (!ready) {
    return null;
  }

  return (
    <RouterContextProvider router={router}>
      <QueryClientProvider client={queryClient}>
        <div className="w-full max-w-7xl">
          <FindingDetailContent findingId={effectiveFinding.id} />
        </div>
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
  title: "Resources/Findings/Detail",
  component: FindingDetailContentStoryShell,
  parameters: {
    layout: "padded",
  },
  args: {
    finding: FINDING,
    asset: ASSET,
    users: USERS,
    scenario: "success",
  },
  render: (args) => <FindingDetailContentStoryShell {...args} />,
} satisfies Meta<typeof FindingDetailContentStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithDueDate: Story = {};

export const Undated: Story = {
  args: {
    scenario: "undated",
  },
};

export const Loading: Story = {
  args: {
    scenario: "loading",
  },
};

export const UpdateError: Story = {
  args: {
    scenario: "error-update",
  },
};
