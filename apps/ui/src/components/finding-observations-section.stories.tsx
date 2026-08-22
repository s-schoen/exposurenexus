import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/types/model/affected-resource";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { observationSchema, ObservationSource } from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { FindingObservationsSection } from "@/components/finding-observations-section.tsx";

import type { Finding } from "@exposurenexus/types/model/finding";
import type {
  ManualObservationInput,
  Observation,
  UpdateObservation,
} from "@exposurenexus/types/model/observation";
import type { Meta, StoryObj } from "@storybook/react-vite";

type Scenario = "populated" | "single" | "empty" | "loading" | "error";

interface StoryArgs {
  scenario: Scenario;
}

const ids = {
  finding: "2713d833-eb13-4517-ac7c-7761545ed42a",
  asset: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  user: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
};

const finding: Finding = {
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
  observationCount: 7,
  firstSeen: new Date("2026-06-01T09:00:00.000Z"),
  lastSeen: new Date("2026-06-08T09:00:00.000Z"),
  createdAt: new Date("2026-06-01T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
};

const targetFinding: Finding = {
  ...finding,
  id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
  title: "Target finding",
  observationCount: 0,
  firstSeen: null,
  lastSeen: null,
};

const unspecifiedObservation = observationSchema.parse({
  id: "9e361a0f-b8c2-47e6-af9a-9262782ac31b",
  findingId: finding.id,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Unspecified resource",
  description: null,
  evidence: null,
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: {} },
  affectedResource: { type: AffectedResourceType.Unspecified },
  observedAt: new Date("2026-06-07T09:00:00.000Z"),
  createdAt: new Date("2026-06-08T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
});
const reportedEndpointObservation = observationSchema.parse({
  id: "197083f7-91c2-4c36-9a20-7ff90fd45e91",
  findingId: finding.id,
  ingestionId: "16c25531-28e5-43d7-bbfd-8709ae8e907c",
  source: ObservationSource.Nuclei,
  title: "Reported endpoint URL",
  description: "The endpoint exposed administrative controls.",
  evidence: "`GET /admin?debug=true` returned **200**.",
  remediation: "Restrict access to trusted networks.",
  severity: VulnerabilitySeverity.Critical,
  weakness: { identifiers: { cwe: ["CWE-200"] } },
  affectedResource: {
    type: AffectedResourceType.WebEndpoint,
    scheme: "https",
    host: "example.com",
    port: 443,
    path: "/admin",
    method: "GET",
    component: { kind: WebEndpointComponentKind.QueryParameter, name: "debug" },
    reportedUrl: "https://example.com/admin?debug=true",
  },
  observedAt: new Date("2026-06-06T09:00:00.000Z"),
  createdAt: new Date("2026-06-08T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
});
const networkServiceObservation = observationSchema.parse({
  id: "3201c54b-01aa-46f1-895c-4c9718f87113",
  findingId: finding.id,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Observed network service",
  description: null,
  evidence: null,
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: {} },
  affectedResource: {
    type: AffectedResourceType.NetworkService,
    host: "db.example.com",
    port: 5432,
    transport: "tcp",
    protocol: "postgresql",
  },
  observedAt: new Date("2026-06-05T09:00:00.000Z"),
  createdAt: new Date("2026-06-08T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
});
const sourceCodeObservation = observationSchema.parse({
  id: "1431897b-8d86-47f1-94f4-ac955cd120cf",
  findingId: finding.id,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Source revision snapshot",
  description: null,
  evidence: null,
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: {} },
  affectedResource: {
    type: AffectedResourceType.SourceCode,
    repository: "github.com/example/service",
    revision: "9a0f8c1",
    file: "src/admin.ts",
    location: { startLine: 42, startColumn: 5, endLine: 44, endColumn: 12 },
    symbol: "adminHandler",
    locationFingerprint: "sha256:abcd",
  },
  observedAt: new Date("2026-06-04T09:00:00.000Z"),
  createdAt: new Date("2026-06-08T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
});
const packageObservation = observationSchema.parse({
  id: "db85c61c-e66b-41a5-ab46-0d133b84e443",
  findingId: finding.id,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Package version snapshot",
  description: null,
  evidence: null,
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: {} },
  affectedResource: {
    type: AffectedResourceType.Package,
    ecosystem: "npm",
    name: "example-package",
    version: "1.2.3",
    installationPath: "package-lock.json",
  },
  observedAt: new Date("2026-06-03T09:00:00.000Z"),
  createdAt: new Date("2026-06-08T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
});
const containerImageObservation = observationSchema.parse({
  id: "c41e64a0-ddc3-4ae7-b7f0-2d73d40768ce",
  findingId: finding.id,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Container tag snapshot",
  description: null,
  evidence: null,
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: {} },
  affectedResource: {
    type: AffectedResourceType.ContainerImage,
    registry: "registry.example.com",
    repository: "platform/admin",
    digest: "sha256:abcd",
    tag: "release-2026-06",
  },
  observedAt: new Date("2026-06-02T09:00:00.000Z"),
  createdAt: new Date("2026-06-08T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
});
const cloudResourceObservation = observationSchema.parse({
  id: "cdef95d7-0344-4580-9f96-4c75ec44fe1c",
  findingId: finding.id,
  ingestionId: null,
  source: ObservationSource.Manual,
  title: "Cloud display name snapshot",
  description: null,
  evidence: null,
  remediation: null,
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: {} },
  affectedResource: {
    type: AffectedResourceType.CloudResource,
    provider: "aws",
    providerAccount: "123456789012",
    region: "eu-central-1",
    resourceId: "arn:aws:s3:::public-admin-data",
    subresource: "bucket-policy",
    displayName: "Public admin exports",
  },
  observedAt: new Date("2026-06-01T09:00:00.000Z"),
  createdAt: new Date("2026-06-08T09:00:00.000Z"),
  updatedAt: new Date("2026-06-08T09:00:00.000Z"),
  createdBy: ids.user,
  updatedBy: ids.user,
});

const observations: Array<Observation> = [
  unspecifiedObservation,
  reportedEndpointObservation,
  networkServiceObservation,
  sourceCodeObservation,
  packageObservation,
  containerImageObservation,
  cloudResourceObservation,
];

function objectResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function listResponse(data: Array<unknown>) {
  return objectResponse({ items: data });
}

function readRequestBody<T>(init: RequestInit | undefined): Promise<T> {
  return new Response(init?.body).json() as Promise<T>;
}

function StoryShell({ scenario }: StoryArgs) {
  const records = useRef(
    scenario === "populated" ? observations : scenario === "single" ? [unspecifiedObservation] : [],
  );
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
    const findingsPath = "/api/findings";
    const observationsPath = `${findingsPath}/${finding.id}/observations`;
    const observationPaths = {
      collection: observationsPath,
      update: (observationId: string) => `${observationsPath}/${observationId}`,
      move: (observationId: string) => `${observationsPath}/${observationId}/move`,
    };

    async function createObservation(init: RequestInit | undefined) {
      const payload = await readRequestBody<ManualObservationInput>(init);
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

    async function updateObservation(observation: Observation, init: RequestInit | undefined) {
      const payload = await readRequestBody<UpdateObservation>(init);
      const updated: Observation = {
        ...observation,
        ...payload,
        observedAt: payload.observedAt ? new Date(payload.observedAt) : observation.observedAt,
        updatedAt: new Date("2026-06-09T09:00:00.000Z"),
        updatedBy: ids.user,
      };
      records.current = records.current.map((record) =>
        record.id === observation.id ? updated : record,
      );
      return objectResponse(updated);
    }

    function deleteObservation(observation: Observation) {
      records.current = records.current.filter((record) => record.id !== observation.id);
      return objectResponse(observation);
    }

    async function moveObservation(observation: Observation, init: RequestInit | undefined) {
      const payload = await readRequestBody<{ targetFindingId: string }>(init);
      const moved: Observation = {
        ...observation,
        findingId: payload.targetFindingId,
        updatedAt: new Date("2026-06-09T09:00:00.000Z"),
        updatedBy: ids.user,
      };
      records.current = records.current.filter((record) => record.id !== observation.id);
      return objectResponse(moved);
    }

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(requestUrl, "http://localhost").pathname;
      const method = (init?.method ?? "GET").toUpperCase();

      // Fetch interception keeps Storybook interactions exercising the real API and lifecycle boundary.
      if (url === findingsPath && method === "GET") {
        return listResponse([finding, targetFinding]);
      }
      if (url === observationPaths.collection && method === "GET") {
        if (scenario === "loading") return await new Promise<Response>(() => {});
        if (scenario === "error") return objectResponse({ message: "Failed" }, 500);
        return listResponse(records.current);
      }
      if (url === observationPaths.collection && method === "POST") {
        return createObservation(init);
      }

      const observationToMove = records.current.find(
        (observation) => url === observationPaths.move(observation.id),
      );
      if (observationToMove && method === "POST") {
        return moveObservation(observationToMove, init);
      }

      const observationById = records.current.find(
        (observation) => url === observationPaths.update(observation.id),
      );
      if (observationById && method === "PUT") {
        return updateObservation(observationById, init);
      }
      if (observationById && method === "DELETE") {
        return deleteObservation(observationById);
      }

      return originalFetch(input, init);
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
      <ConfirmDialog.Root />
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
export const EditObservation: Story = {
  args: { scenario: "populated" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Correct observation",
    });
    await userEvent.clear(within(dialog).getByLabelText("Title"));
    await userEvent.type(within(dialog).getByLabelText("Title"), "Corrected observation");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save correction" }));
    await expect(await canvas.findByText("Corrected observation")).toBeVisible();
  },
};
export const DeleteFinalObservation: Story = {
  args: { scenario: "single" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete observation Unspecified resource" }),
    );
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Delete observation",
    });
    await expect(dialog).toHaveTextContent(
      "The finding remains, even if this is its final observation.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete observation" }));
    await expect(canvas.getByText("No observations recorded")).toBeVisible();
  },
};
export const MoveObservation: Story = {
  args: { scenario: "populated" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Move observation Unspecified resource" }),
    );
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog", {
      name: "Move observation",
    });
    await userEvent.click(within(dialog).getByLabelText("Target finding"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Target finding",
      }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Move observation" }));
    await waitFor(() => expect(canvas.queryByText("Unspecified resource")).not.toBeInTheDocument());
  },
};
