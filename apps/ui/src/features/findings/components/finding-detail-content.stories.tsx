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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef } from "react";
import { expect, userEvent, within } from "storybook/test";

import { FindingPreview } from "@/features/findings/components/finding-preview.tsx";
import { routeTree } from "@/routeTree.gen.ts";
import { STORY_VULNERABILITIES } from "@/test/fixtures.ts";
import { createStoryLoginRedirects } from "@/test/storybook.tsx";

import type { FindingAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { Meta, StoryObj } from "@storybook/react-vite";

type FindingDetailScenario =
  | "success"
  | "undated"
  | "empty"
  | "loading"
  | "finding-error"
  | "asset-error"
  | "observation-error";

type FindingDetailStoryArgs = {
  finding: Finding;
  asset: Asset;
  users: Array<UserProfile>;
  scenario: FindingDetailScenario;
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
];

const ASSET: Asset = {
  id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  displayName: "web-01",
  type: AssetType.Host,
  environment: AssetEnvironment.Production,
  lifecycleState: AssetLifecycleState.Active,
  ownerId: USERS[0].id,
  identifiers: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  createdBy: USERS[0].id,
  updatedBy: USERS[1].id,
};

const baseFinding: Finding = {
  id: "2713d833-eb13-4517-ac7c-7761545ed42a",
  assetId: ASSET.id,
  title: "Exposed Admin Endpoint",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Confirmed,
  assigneeId: USERS[1].id,
  dueDate: new Date("2026-05-12T00:00:00.000Z"),
  mitigation: "Restrict administrative access to VPN networks.",
  weakness: {
    identifiers: {
      cwe: ["CWE-200"],
      nuclei: ["admin-panel"],
    },
  },
  affectedResource: {
    type: AffectedResourceType.WebEndpoint,
    scheme: "https",
    host: "example.com",
    port: 443,
    path: "/admin",
    method: "GET",
    component: { kind: WebEndpointComponentKind.Endpoint },
  },
  vulnerabilities: [
    {
      id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      type: VulnerabilityType.Cve,
      identifier: "CVE-2026-0001",
      title: "Example endpoint exposure",
      description: "The endpoint is reachable from an untrusted network.",
      severity: VulnerabilitySeverity.High,
      metadata: { cvss: 8.1 },
      createdBy: USERS[0].id,
      updatedBy: USERS[1].id,
      createdAt: new Date("2026-04-30T12:00:00.000Z"),
      updatedAt: new Date("2026-05-01T08:30:00.000Z"),
    },
    {
      id: "4fb566c6-e642-48d8-b70d-418efb074f8d",
      type: VulnerabilityType.Cwe,
      identifier: "CWE-200",
      title: "Exposure of Sensitive Information",
      description: null,
      severity: VulnerabilitySeverity.Medium,
      metadata: null,
      createdBy: USERS[0].id,
      updatedBy: USERS[1].id,
      createdAt: new Date("2026-04-30T12:00:00.000Z"),
      updatedAt: new Date("2026-05-01T08:30:00.000Z"),
    },
  ],
  observationCount: 4,
  firstSeen: new Date("2026-05-01T09:15:00.000Z"),
  lastSeen: new Date("2026-05-05T16:20:00.000Z"),
  createdBy: USERS[0].id,
  updatedBy: USERS[1].id,
  createdAt: new Date("2026-05-01T09:15:00.000Z"),
  updatedAt: new Date("2026-05-05T16:20:00.000Z"),
};

const RESOURCE_VARIANTS: Record<string, FindingAffectedResource> = {
  Unspecified: { type: AffectedResourceType.Unspecified },
  WebEndpoint: baseFinding.affectedResource,
  NetworkService: {
    type: AffectedResourceType.NetworkService,
    host: "db.example.com",
    port: 5432,
    transport: "tcp",
    protocol: "postgresql",
  },
  SourceCode: {
    type: AffectedResourceType.SourceCode,
    repository: "github.com/org/repo",
    file: "src/data.ts",
    location: { startLine: 434, startColumn: 12, endLine: 434, endColumn: 31 },
    symbol: "loadCustomerData",
    locationFingerprint: "sha256:9dd7b2",
  },
  Package: {
    type: AffectedResourceType.Package,
    ecosystem: "npm",
    name: "express",
    installationPath: "package-lock.json",
  },
  ContainerImage: {
    type: AffectedResourceType.ContainerImage,
    registry: "registry.example.com",
    repository: "payments/backend",
    digest: "sha256:abcd",
  },
  CloudResource: {
    type: AffectedResourceType.CloudResource,
    provider: "aws",
    providerAccount: "123456789012",
    region: "eu-central-1",
    resourceId: "arn:aws:s3:::example-bucket",
    subresource: "public-policy",
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
            firstSeen: null,
            lastSeen: null,
            observationCount: 0,
          }
        : scenario === "empty"
          ? {
              ...finding,
              vulnerabilities: [],
              observationCount: 0,
              firstSeen: null,
              lastSeen: null,
            }
          : finding,
    [finding, scenario],
  );
  const findingRef = useRef(effectiveFinding);
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });

    if (scenario !== "loading" && scenario !== "finding-error") {
      client.setQueryData(["findings", effectiveFinding.id], effectiveFinding);
      if (scenario !== "asset-error") client.setQueryData(["assets", asset.id], asset);
      client.setQueryData(["users"], users);
      client.setQueryData(["vulnerabilities"], STORY_VULNERABILITIES);
    }

    return client;
  }, [asset, effectiveFinding, scenario, users]);
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        history: createMemoryHistory({ initialEntries: [`/findings/${effectiveFinding.id}`] }),
        context: {
          auth: undefined!,
          page: undefined!,
          redirects: createStoryLoginRedirects(),
          queryClient,
        },
      }),
    [effectiveFinding.id, queryClient],
  );

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    findingRef.current = effectiveFinding;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      if (requestUrl.endsWith(`/api/findings/${effectiveFinding.id}/observations`)) {
        if (scenario === "observation-error")
          return new Response(JSON.stringify({ error: "Observations failed" }), { status: 500 });
        return createArrayResponse([]);
      }
      if (requestUrl.endsWith(`/api/findings/${effectiveFinding.id}`)) {
        if (scenario === "finding-error")
          return new Response(JSON.stringify({ error: "Finding failed" }), { status: 500 });
        if (scenario === "loading") return await new Promise<Response>(() => {});
        if (init?.method === "PUT") {
          const update = JSON.parse(await new Response(init.body).text()) as Partial<Finding>;
          findingRef.current = { ...findingRef.current, ...update };
          queryClient.setQueryData(["findings", effectiveFinding.id], findingRef.current);
        }
        return createObjectResponse(findingRef.current);
      }
      if (requestUrl.endsWith(`/api/assets/${asset.id}`)) {
        if (scenario === "asset-error")
          return new Response(JSON.stringify({ error: "Asset failed" }), { status: 500 });
        return createObjectResponse(asset);
      }
      if (requestUrl.endsWith("/api/users")) return createArrayResponse(users);
      if (requestUrl.endsWith("/api/vulnerabilities")) {
        return createArrayResponse(STORY_VULNERABILITIES);
      }
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [asset, effectiveFinding, scenario, users]);

  return (
    <RouterContextProvider router={router}>
      <QueryClientProvider client={queryClient}>
        <div className="w-full max-w-7xl">
          <FindingPreview findingId={effectiveFinding.id} />
        </div>
      </QueryClientProvider>
    </RouterContextProvider>
  );
}

function createObjectResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json" },
  });
}

function createArrayResponse(data: Array<unknown>): Response {
  return new Response(JSON.stringify({ data: { items: data } }), {
    headers: { "Content-Type": "application/json" },
  });
}

const meta = {
  title: "Resources/Findings/Detail",
  component: FindingDetailContentStoryShell,
  parameters: { layout: "padded" },
  args: { finding: baseFinding, asset: ASSET, users: USERS, scenario: "success" },
  render: (args) => <FindingDetailContentStoryShell {...args} />,
} satisfies Meta<typeof FindingDetailContentStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithDueDate: Story = {};
export const Undated: Story = { args: { scenario: "undated" } };
export const EmptyFinding: Story = { args: { scenario: "empty" } };
export const Loading: Story = { args: { scenario: "loading" } };
export const EditableCorrection: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit finding" }));
    await expect(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Correct finding" }),
    ).toHaveAttribute("data-open");
  },
};

export const UnspecifiedResource: Story = {
  args: { finding: { ...baseFinding, affectedResource: RESOURCE_VARIANTS.Unspecified } },
};
export const WebEndpointResource: Story = {
  args: { finding: { ...baseFinding, affectedResource: RESOURCE_VARIANTS.WebEndpoint } },
};
export const NetworkServiceResource: Story = {
  args: { finding: { ...baseFinding, affectedResource: RESOURCE_VARIANTS.NetworkService } },
};
export const SourceCodeResource: Story = {
  args: { finding: { ...baseFinding, affectedResource: RESOURCE_VARIANTS.SourceCode } },
};
export const PackageResource: Story = {
  args: { finding: { ...baseFinding, affectedResource: RESOURCE_VARIANTS.Package } },
};
export const ContainerImageResource: Story = {
  args: { finding: { ...baseFinding, affectedResource: RESOURCE_VARIANTS.ContainerImage } },
};
export const CloudResource: Story = {
  args: { finding: { ...baseFinding, affectedResource: RESOURCE_VARIANTS.CloudResource } },
};
