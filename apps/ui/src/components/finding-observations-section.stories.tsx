import {
  AffectedResourceType,
  NetworkTransport,
  WebEndpointComponentKind,
} from "@exposurenexus/types/model/affected-resource";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { observationSchema, ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { FindingObservationsSection } from "@/components/finding-observations-section.tsx";

import type { ObservationAffectedResourceInput as ObservationResource } from "@exposurenexus/types/model/affected-resource";
import type { FindingProjection, ManualObservationInput } from "@exposurenexus/types/model/finding";
import type { Observation } from "@exposurenexus/types/model/observation";
import type { Meta, StoryObj } from "@storybook/react-vite";

type Scenario = "populated" | "empty" | "loading" | "error";

interface StoryArgs {
  scenario: Scenario;
}

const ids = {
  finding: "2713d833-eb13-4517-ac7c-7761545ed42a",
  asset: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  user: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
};

const finding: FindingProjection = {
  id: ids.finding,
  assetId: ids.asset,
  title: "Exposed Admin Endpoint",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Confirmed,
  assigneeId: null,
  dueDate: null,
  mitigation: null,
  weakness: { identifiers: { cwe: ["CWE-200"] } },
  affectedResource: {
    type: AffectedResourceType.WebEndpoint,
    scheme: "https",
    host: "example.com",
    port: 443,
    path: "/admin",
  },
  vulnerabilities: [],
  observationCount: 8,
  observingSources: [ObservationSource.Manual, ObservationSource.Nuclei],
  firstSeen: new Date("2026-06-01T09:00:00.000Z"),
  lastSeen: new Date("2026-06-08T09:00:00.000Z"),
  createdAt: new Date("2026-06-01T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
};

const resources: Array<[string, ObservationResource]> = [
  ["Asset-wide observation", { type: AffectedResourceType.Asset }],
  ["Unspecified resource", { type: AffectedResourceType.Unspecified }],
  [
    "Reported endpoint URL",
    {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "example.com",
      port: 443,
      path: "/admin",
      method: "GET",
      component: { kind: WebEndpointComponentKind.QueryParameter, name: "debug" },
      reportedUrl: "https://example.com/admin?debug=true",
    },
  ],
  [
    "Observed network service",
    {
      type: AffectedResourceType.NetworkService,
      host: "db.example.com",
      port: 5432,
      transport: NetworkTransport.Tcp,
      protocol: "postgresql",
    },
  ],
  [
    "Source revision snapshot",
    {
      type: AffectedResourceType.SourceCode,
      repository: "github.com/example/service",
      revision: "9a0f8c1",
      file: "src/admin.ts",
      location: { startLine: 42, startColumn: 5, endLine: 44, endColumn: 12 },
      symbol: "adminHandler",
      locationFingerprint: "sha256:abcd",
    },
  ],
  [
    "Package version snapshot",
    {
      type: AffectedResourceType.Package,
      ecosystem: "npm",
      name: "example-package",
      version: "1.2.3",
      installationPath: "package-lock.json",
    },
  ],
  [
    "Container tag snapshot",
    {
      type: AffectedResourceType.ContainerImage,
      registry: "registry.example.com",
      repository: "platform/admin",
      digest: "sha256:abcd",
      tag: "release-2026-06",
    },
  ],
  [
    "Cloud display name snapshot",
    {
      type: AffectedResourceType.CloudResource,
      provider: "aws",
      providerAccount: "123456789012",
      region: "eu-central-1",
      resourceId: "arn:aws:s3:::public-admin-data",
      subresource: "bucket-policy",
      displayName: "Public admin exports",
    },
  ],
];

const observations = resources.map(([title, affectedResource], index) =>
  observationSchema.parse({
    id: [
      "f39a0c31-33b9-4f10-a128-35158dee4a26",
      "9e361a0f-b8c2-47e6-af9a-9262782ac31b",
      "197083f7-91c2-4c36-9a20-7ff90fd45e91",
      "3201c54b-01aa-46f1-895c-4c9718f87113",
      "1431897b-8d86-47f1-94f4-ac955cd120cf",
      "db85c61c-e66b-41a5-ab46-0d133b84e443",
      "c41e64a0-ddc3-4ae7-b7f0-2d73d40768ce",
      "cdef95d7-0344-4580-9f96-4c75ec44fe1c",
    ][index],
    findingId: finding.id,
    ingestionId: index === 2 ? "16c25531-28e5-43d7-bbfd-8709ae8e907c" : null,
    source: index === 2 ? ObservationSource.Nuclei : ObservationSource.Manual,
    title,
    description: index === 2 ? "The endpoint exposed administrative controls." : null,
    evidence: index === 2 ? "`GET /admin?debug=true` returned **200**." : null,
    remediation: index === 2 ? "Restrict access to trusted networks." : null,
    severity: index === 2 ? VulnerabilitySeverity.Critical : VulnerabilitySeverity.High,
    weakness: { identifiers: index === 2 ? { cwe: ["CWE-200"] } : {} },
    affectedResource,
    observedAt: new Date(`2026-06-${String(8 - index).padStart(2, "0")}T09:00:00.000Z`),
    createdAt: new Date("2026-06-08T09:00:00.000Z"),
    updatedAt: new Date("2026-06-08T09:00:00.000Z"),
    createdBy: ids.user,
    updatedBy: ids.user,
  }),
);

function objectResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function listResponse(data: Array<unknown>) {
  return objectResponse({ items: data });
}

function StoryShell({ scenario }: StoryArgs) {
  const records = useRef(scenario === "populated" ? observations : []);
  const [ready, setReady] = useState(false);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
      }),
    [],
  );

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.endsWith(`/api/findings/${finding.id}/observations`)) return originalFetch(input);
      if (scenario === "loading") return await new Promise<Response>(() => {});
      if (scenario === "error") return objectResponse({ message: "Failed" }, 500);
      if (init?.method === "POST") {
        const payload = JSON.parse(await new Response(init.body).text()) as ManualObservationInput;
        const now = new Date("2026-06-09T09:00:00.000Z");
        const created: Observation = {
          id: "b933179c-6d4d-47a8-853e-e921a388309f",
          findingId: finding.id,
          ingestionId: null,
          source: ObservationSource.Manual,
          title: payload.title ?? finding.title,
          description: payload.description ?? null,
          evidence: payload.evidence ?? null,
          remediation: payload.remediation ?? null,
          severity: payload.severity ?? finding.severity,
          weakness: payload.weakness ?? finding.weakness,
          affectedResource: payload.affectedResource ?? finding.affectedResource,
          observedAt: payload.observedAt ?? now,
          createdAt: now,
          updatedAt: now,
          createdBy: ids.user,
          updatedBy: ids.user,
        };
        records.current = [created, ...records.current];
        return objectResponse(created);
      }
      return listResponse(records.current);
    };
    setReady(true);
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [scenario]);

  if (!ready) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <FindingObservationsSection finding={finding} />
    </QueryClientProvider>
  );
}

const meta = {
  title: "Resources/Findings/Observations",
  component: StoryShell,
  parameters: { layout: "padded" },
  args: { scenario: "populated" },
} satisfies Meta<typeof StoryShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { scenario: "empty" } };
export const Loading: Story = { args: { scenario: "loading" } };
export const ErrorState: Story = { args: { scenario: "error" } };
export const AddManualObservation: Story = {
  args: { scenario: "empty" },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Add observation" }),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByRole("dialog", {
        name: "Add manual observation",
      }),
    ).toHaveAttribute("data-open");
  },
};
