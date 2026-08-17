import {
  AffectedResourceType,
  NetworkTransport,
  WebEndpointComponentKind,
} from "@exposurenexus/types/model/affected-resource";
import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity, VulnerabilityType } from "@exposurenexus/types/model/vulnerability";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { FindingDetailContent } from "@/components/finding-detail-content.tsx";
import { createLoginRedirects } from "@/lib/login-redirect.ts";
import { routeTree } from "@/routeTree.gen.ts";

import type { FindingAffectedResource } from "@exposurenexus/types/model/affected-resource";
import type { Asset } from "@exposurenexus/types/model/asset";
import type { FindingProjection } from "@exposurenexus/types/model/finding";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { Meta, StoryObj } from "@storybook/react-vite";

type FindingDetailScenario = "success" | "undated" | "empty" | "loading";

type FindingDetailStoryArgs = {
  finding: FindingProjection;
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

const baseFinding: FindingProjection = {
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
  observingSources: [ObservationSource.Manual, ObservationSource.Nuclei],
  firstSeen: new Date("2026-05-01T09:15:00.000Z"),
  lastSeen: new Date("2026-05-05T16:20:00.000Z"),
  createdBy: USERS[0].id,
  updatedBy: USERS[1].id,
  createdAt: new Date("2026-05-01T09:15:00.000Z"),
  updatedAt: new Date("2026-05-05T16:20:00.000Z"),
};

const RESOURCE_VARIANTS: Record<string, FindingAffectedResource> = {
  Asset: { type: AffectedResourceType.Asset },
  Unspecified: { type: AffectedResourceType.Unspecified },
  WebEndpoint: baseFinding.affectedResource,
  NetworkService: {
    type: AffectedResourceType.NetworkService,
    host: "db.example.com",
    port: 5432,
    transport: NetworkTransport.Tcp,
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
            observingSources: [],
          }
        : scenario === "empty"
          ? {
              ...finding,
              vulnerabilities: [],
              observationCount: 0,
              observingSources: [],
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
        history: createMemoryHistory({ initialEntries: [`/findings/${effectiveFinding.id}`] }),
        context: {
          auth: undefined!,
          page: undefined!,
          redirects: createLoginRedirects({
            origin: "http://localhost",
            isKnownRoutePath: () => true,
          }),
          queryClient,
        },
      }),
    [effectiveFinding.id, queryClient],
  );
  const [ready, setReady] = useState(scenario !== "loading");

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    findingRef.current = effectiveFinding;

    globalThis.fetch = async (input) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      if (requestUrl.endsWith(`/api/findings/${effectiveFinding.id}`)) {
        if (scenario === "loading") return await new Promise<Response>(() => {});
        return createObjectResponse(findingRef.current);
      }
      if (requestUrl.endsWith(`/api/assets/${asset.id}`)) return createObjectResponse(asset);
      if (requestUrl.endsWith("/api/users")) return createArrayResponse(users);
      return originalFetch(input);
    };

    setReady(true);
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [asset, effectiveFinding, scenario, users]);

  if (!ready) return null;

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

export const AssetResource: Story = {
  args: { finding: { ...baseFinding, affectedResource: RESOURCE_VARIANTS.Asset } },
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
