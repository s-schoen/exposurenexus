import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as stories from "@/features/findings/components/finding-observations-section.stories.tsx";

import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";

const { AddManualObservation, DeleteFinalObservation, Empty, ErrorState, Loading, Populated } =
  composeStories(stories);
const originalFetch = globalThis.fetch;

function parseRequestBody(init: RequestInit | undefined) {
  if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
  return JSON.parse(init.body) as unknown;
}

function requestPath(input: RequestInfo | URL) {
  const requestUrl =
    input instanceof Request ? input.url : input instanceof URL ? input.href : input;
  return new URL(requestUrl, "http://localhost").pathname;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function responseWithError(status = 500) {
  return new Response(JSON.stringify({ error: "Failed" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type ResourceCase = {
  typeLabel: string;
  expected: ObservationAffectedResource;
  fields: Array<[string, string]>;
  selects?: Array<[string, string]>;
};

const resourceCases: Array<ResourceCase> = [
  {
    typeLabel: "Web endpoint",
    expected: {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "api.example.com",
      port: 8443,
      path: "/admin",
      method: "POST",
      reportedUrl: "https://api.example.com/admin",
      component: { kind: WebEndpointComponentKind.QueryParameter, name: "debug" },
    },
    fields: [
      ["Host", "api.example.com"],
      ["Port", "8443"],
      ["Path", "/admin"],
      ["Method", "POST"],
      ["Reported URL", "https://api.example.com/admin"],
      ["Component name", "debug"],
    ],
    selects: [
      ["Scheme", "HTTPS"],
      ["Component kind", "QueryParameter"],
    ],
  },
  {
    typeLabel: "Network service",
    expected: {
      type: AffectedResourceType.NetworkService,
      host: "db.example.com",
      port: 5432,
      transport: "tcp",
      protocol: "postgresql",
    },
    fields: [
      ["Host", "db.example.com"],
      ["Port", "5432"],
      ["Protocol", "postgresql"],
    ],
    selects: [["Transport", "TCP"]],
  },
  {
    typeLabel: "Source code",
    expected: {
      type: AffectedResourceType.SourceCode,
      repository: "github.com/example/service",
      revision: "9a0f8c1",
      file: "src/admin.ts",
      location: { startLine: 42, startColumn: 5, endLine: 44, endColumn: 12 },
      symbol: "adminHandler",
      locationFingerprint: "sha256:abcd",
    },
    fields: [
      ["Repository", "github.com/example/service"],
      ["Revision", "9a0f8c1"],
      ["File", "src/admin.ts"],
      ["Start line", "42"],
      ["Start column", "5"],
      ["End line", "44"],
      ["End column", "12"],
      ["Symbol", "adminHandler"],
      ["Location fingerprint", "sha256:abcd"],
    ],
  },
  {
    typeLabel: "Package",
    expected: {
      type: AffectedResourceType.Package,
      ecosystem: "npm",
      name: "example-package",
      version: "1.2.3",
      installationPath: "package-lock.json",
    },
    fields: [
      ["Ecosystem", "npm"],
      ["Package name", "example-package"],
      ["Version", "1.2.3"],
      ["Installation path", "package-lock.json"],
    ],
  },
  {
    typeLabel: "Container image",
    expected: {
      type: AffectedResourceType.ContainerImage,
      registry: "registry.example.com",
      repository: "platform/admin",
      digest: "sha256:abcd",
      tag: "release-2026-06",
    },
    fields: [
      ["Registry", "registry.example.com"],
      ["Repository", "platform/admin"],
      ["Digest", "sha256:abcd"],
      ["Tag", "release-2026-06"],
    ],
  },
  {
    typeLabel: "Cloud resource",
    expected: {
      type: AffectedResourceType.CloudResource,
      provider: "aws",
      providerAccount: "123456789012",
      region: "eu-central-1",
      resourceId: "arn:aws:s3:::admin-data",
      subresource: "bucket-policy",
      displayName: "Public admin exports",
    },
    fields: [
      ["Provider", "aws"],
      ["Provider account", "123456789012"],
      ["Region", "eu-central-1"],
      ["Resource ID", "arn:aws:s3:::admin-data"],
      ["Subresource", "bucket-policy"],
      ["Display name", "Public admin exports"],
    ],
  },
];

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe("FindingObservationsSection", () => {
  it("renders observation content and every typed resource snapshot variant", async () => {
    render(<Populated />);

    expect(await screen.findByText("Reported endpoint URL")).toBeVisible();
    expect(screen.getByText("The endpoint exposed administrative controls.")).toBeVisible();
    expect(screen.getByText("GET /admin?debug=true")).toBeVisible();
    expect(screen.getByText("Restrict access to trusted networks.")).toBeVisible();
    expect(screen.getByText(/CWE-200/)).toBeVisible();
    for (const value of [
      "Unspecified resource",
      "Observed network service",
      "9a0f8c1",
      "1.2.3",
      "release-2026-06",
      "Public admin exports",
      "https://example.com/admin?debug=true",
    ]) {
      expect(screen.getAllByText(value)[0]).toBeVisible();
    }
  });

  it("renders loading, error, and empty states", async () => {
    const loading = render(<Loading />);
    expect(await screen.findByLabelText("Loading observations")).toBeVisible();
    loading.unmount();

    const error = render(<ErrorState />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load observations");
    error.unmount();

    render(<Empty />);
    expect(await screen.findByText("No observations recorded")).toBeVisible();
  });

  it("keeps observation ownership fields immutable", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));

    const dialog = screen.getByRole("dialog", { name: "Add manual observation" });
    expect(within(dialog).queryByLabelText("Source")).toBeNull();
    expect(within(dialog).queryByLabelText("Ingestion")).toBeNull();
    expect(within(dialog).queryByLabelText("Finding")).toBeNull();
  });

  it.each([
    ["Web endpoint", "Reported URL"],
    ["Network service", "Protocol"],
    ["Source code", "Revision"],
    ["Package", "Version"],
    ["Container image", "Tag"],
    ["Cloud resource", "Display name"],
  ] as const)("offers %s observation snapshot fields", async (type, snapshotLabel) => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const dialog = screen.getByRole("dialog", { name: "Add manual observation" });

    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(await screen.findByRole("option", { name: type }));
    expect(await within(dialog).findByLabelText(snapshotLabel)).toBeVisible();
  });

  it.each(resourceCases)(
    "submits all %s fields when adding an observation",
    async (resourceCase) => {
      const actor = userEvent.setup();
      render(<AddManualObservation />);
      await actor.click(await screen.findByRole("button", { name: "Add observation" }));
      const fetchSpy = vi.fn(globalThis.fetch);
      globalThis.fetch = fetchSpy;
      const dialog = await screen.findByRole("dialog", { name: "Add manual observation" });

      await actor.click(within(dialog).getByLabelText("Affected resource type"));
      await actor.click(await screen.findByRole("option", { name: resourceCase.typeLabel }));
      for (const [label, option] of resourceCase.selects ?? []) {
        await actor.click(within(dialog).getByLabelText(label));
        await actor.click(await screen.findByRole("option", { name: option }));
      }
      for (const [label, value] of resourceCase.fields) {
        fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
      }
      await actor.click(within(dialog).getByRole("button", { name: "Add observation" }));

      await waitFor(() =>
        expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
      );
      const post = fetchSpy.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
      expect(parseRequestBody(post)).toEqual(
        expect.objectContaining({ affectedResource: resourceCase.expected }),
      );
    },
  );

  it.each(resourceCases)(
    "submits all %s fields when correcting an observation",
    async (resourceCase) => {
      const actor = userEvent.setup();
      render(<Populated />);
      const fetchSpy = vi.fn(globalThis.fetch);
      globalThis.fetch = fetchSpy;
      await actor.click(
        await screen.findByRole("button", { name: "Edit observation Unspecified resource" }),
      );
      const dialog = screen.getByRole("dialog", { name: "Correct observation" });

      await actor.click(within(dialog).getByLabelText("Affected resource type"));
      await actor.click(await screen.findByRole("option", { name: resourceCase.typeLabel }));
      for (const [label, option] of resourceCase.selects ?? []) {
        await actor.click(within(dialog).getByLabelText(label));
        await actor.click(await screen.findByRole("option", { name: option }));
      }
      for (const [label, value] of resourceCase.fields) {
        fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
      }
      await actor.click(within(dialog).getByRole("button", { name: "Save correction" }));

      await waitFor(() =>
        expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
      );
      const put = fetchSpy.mock.calls.find(([, init]) => init?.method === "PUT")?.[1];
      expect(parseRequestBody(put)).toEqual(
        expect.objectContaining({ affectedResource: resourceCase.expected }),
      );
    },
  );

  it("removes stale observation resource fields and the whole source location", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    await actor.click(
      await screen.findByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Correct observation" });
    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(await screen.findByRole("option", { name: "Source code" }));

    const source = resourceCases.find(({ typeLabel }) => typeLabel === "Source code");
    if (!source) throw new Error("Missing source-code resource fixture");

    for (const [label, value] of source.fields) {
      await actor.type(within(dialog).getByLabelText(label), value);
    }
    for (const label of ["Start column", "End line", "End column"]) {
      const input = within(dialog).getByLabelText(label);
      await actor.clear(input);
      expect((input as HTMLInputElement).value).toBe("");
    }
    const startLine = within(dialog).getByLabelText("Start line");
    await actor.clear(startLine);
    expect((startLine as HTMLInputElement).value).toBe("");
    for (const label of ["Repository", "Revision", "File", "Symbol", "Location fingerprint"]) {
      await actor.clear(within(dialog).getByLabelText(label));
    }
    await actor.click(within(dialog).getByRole("button", { name: "Save correction" }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    const put = fetchSpy.mock.calls.find(([, init]) => init?.method === "PUT")?.[1];
    expect(parseRequestBody(put)).toEqual(
      expect.objectContaining({
        affectedResource: { type: AffectedResourceType.SourceCode },
      }),
    );
  });

  it("removes a web component name when switching through named, unnamed, and inherited identity", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    const dialog = screen.getByRole("dialog", { name: "Add manual observation" });

    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(await screen.findByRole("option", { name: "Web endpoint" }));
    await actor.click(within(dialog).getByLabelText("Component kind"));
    await actor.click(await screen.findByRole("option", { name: "QueryParameter" }));
    await actor.type(within(dialog).getByLabelText("Component name"), "debug");
    await actor.click(within(dialog).getByLabelText("Component kind"));
    await actor.click(await screen.findByRole("option", { name: "Endpoint" }));
    expect(within(dialog).queryByLabelText("Component name")).toBeNull();
    await actor.click(within(dialog).getByLabelText("Component kind"));
    await actor.click(await screen.findByRole("option", { name: "Header" }));
    expect(within(dialog).getByLabelText("Component name")).toHaveValue("");
    await actor.type(within(dialog).getByLabelText("Component name"), "X-Debug");
    await actor.click(within(dialog).getByLabelText("Component kind"));
    await actor.click(await screen.findByRole("option", { name: "No component" }));
    expect(within(dialog).queryByLabelText("Component name")).toBeNull();
    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(await screen.findByRole("option", { name: "Use finding resource" }));
    await actor.type(within(dialog).getByLabelText("Evidence"), "Inherited identity");
    await actor.click(within(dialog).getByRole("button", { name: "Add observation" }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
    );
    const post = fetchSpy.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
    expect(parseRequestBody(post)).toEqual({ evidence: "Inherited identity" });
  });

  it("uses server defaults for omitted identity fields without changing the parent finding", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const dialog = screen.getByRole("dialog", { name: "Add manual observation" });
    await actor.type(
      within(dialog).getByLabelText("Evidence"),
      "Observed during manual verification",
    );
    await actor.click(within(dialog).getByRole("button", { name: "Add observation" }));

    expect(await screen.findByText("Observed during manual verification")).toBeVisible();
    expect(screen.getByText("Exposed Admin Endpoint")).toBeVisible();
    expect(screen.getByText("Web endpoint")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Add manual observation" })).toBeNull();
  });

  it("clears explicit severity and observed-at overrides back to inherited defaults", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    const dialog = screen.getByRole("dialog", { name: "Add manual observation" });

    await actor.click(within(dialog).getByLabelText("Severity"));
    await actor.click(await screen.findByRole("option", { name: "Critical" }));
    await actor.click(within(dialog).getByLabelText("Severity"));
    await actor.click(await screen.findByRole("option", { name: "Use finding severity" }));
    const observedAt = within(dialog).getByLabelText("Observed at");
    await actor.type(observedAt, "2026-06-10T12:30");
    await actor.clear(observedAt);
    await actor.type(within(dialog).getByLabelText("Evidence"), "Inherited defaults");
    await actor.click(within(dialog).getByRole("button", { name: "Add observation" }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
    );
    const post = fetchSpy.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
    expect(parseRequestBody(post)).toEqual({ evidence: "Inherited defaults" });
  });

  it("clears a corrected observed-at override without changing persisted observation data", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    await actor.click(
      await screen.findByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Correct observation" });
    const observedAt = within(dialog).getByLabelText("Observed at");
    expect((observedAt as HTMLInputElement).value).toMatch(/^2026-06-07T/);
    await actor.clear(observedAt);
    await actor.click(within(dialog).getByRole("button", { name: "Save correction" }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    const put = fetchSpy.mock.calls.find(([, init]) => init?.method === "PUT")?.[1];
    const payload = parseRequestBody(put) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("observedAt");
    expect(screen.getByRole("heading", { name: "Unspecified resource" })).toBeVisible();
  });

  it("submits exact add payloads including observation-only resource snapshots", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    const dialog = await screen.findByRole("dialog", { name: "Add manual observation" });
    await actor.type(within(dialog).getByLabelText("Title"), "Manual endpoint snapshot");
    await actor.click(within(dialog).getByLabelText("Severity"));
    await actor.click(screen.getByRole("option", { name: "Medium" }));
    await actor.type(within(dialog).getByLabelText("Observed at"), "2026-06-10T12:30");
    await actor.type(within(dialog).getByLabelText("Description"), "Observed externally");
    await actor.type(within(dialog).getByLabelText("Evidence"), "GET /admin returned 200");
    await actor.type(within(dialog).getByLabelText("Remediation"), "Restrict access");
    await actor.type(within(dialog).getByLabelText("Weakness identifiers"), "cwe=CWE-284");
    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(screen.getByRole("option", { name: "Web endpoint" }));
    await actor.type(within(dialog).getByLabelText("Host"), "snapshot.example.com");
    await actor.type(
      within(dialog).getByLabelText("Reported URL"),
      "https://snapshot.example.com/admin",
    );
    await actor.click(within(dialog).getByRole("button", { name: "Add observation" }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
    );
    const post = fetchSpy.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
    expect(parseRequestBody(post)).toEqual({
      title: "Manual endpoint snapshot",
      severity: "medium",
      observedAt: new Date("2026-06-10T12:30").toISOString(),
      description: "Observed externally",
      evidence: "GET /admin returned 200",
      remediation: "Restrict access",
      weakness: { identifiers: { cwe: ["CWE-284"] } },
      affectedResource: {
        type: "webEndpoint",
        host: "snapshot.example.com",
        reportedUrl: "https://snapshot.example.com/admin",
      },
    });
  });

  it("returns an explicit add resource to inherited without sending a stale snapshot", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    const dialog = await screen.findByRole("dialog", { name: "Add manual observation" });
    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(screen.getByRole("option", { name: "Package" }));
    await actor.type(within(dialog).getByLabelText("Version"), "1.2.3");
    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(await screen.findByRole("option", { name: "Use finding resource" }));
    await actor.type(within(dialog).getByLabelText("Evidence"), "Inherited identity");
    await actor.click(within(dialog).getByRole("button", { name: "Add observation" }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
    );
    const post = fetchSpy.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
    expect(parseRequestBody(post)).toEqual({ evidence: "Inherited identity" });
  });

  it("corrects observation-owned fields and replaces weakness and resource values", async () => {
    const actor = userEvent.setup();
    render(<Populated />);

    await actor.click(
      await screen.findByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Correct observation" });
    await actor.clear(within(dialog).getByLabelText("Title"));
    await actor.type(within(dialog).getByLabelText("Title"), "Corrected observation");
    await actor.clear(within(dialog).getByLabelText("Weakness identifiers"));
    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(screen.getByRole("option", { name: "Source code" }));
    await actor.type(within(dialog).getByLabelText("File"), "src/query.ts");
    await actor.click(within(dialog).getByRole("button", { name: "Save correction" }));

    expect(await screen.findByText("Corrected observation")).toBeVisible();
    expect(screen.getAllByText("Source code").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No identifiers recorded").length).toBeGreaterThan(0);
  });

  it("submits the exact correction payload and clears weakness", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    await actor.click(
      await screen.findByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Correct observation" });
    await actor.clear(within(dialog).getByLabelText("Weakness identifiers"));
    await actor.clear(within(dialog).getByLabelText("Evidence"));
    await actor.type(within(dialog).getByLabelText("Evidence"), "Corrected evidence");
    await actor.click(within(dialog).getByRole("button", { name: "Save correction" }));

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true),
    );
    const put = fetchSpy.mock.calls.find(([, init]) => init?.method === "PUT")?.[1];
    expect(parseRequestBody(put)).toEqual({
      title: "Unspecified resource",
      description: null,
      evidence: "Corrected evidence",
      remediation: null,
      severity: "high",
      weakness: { identifiers: {} },
      affectedResource: { type: "unspecified" },
      observedAt: "2026-06-07T09:00:00.000Z",
    });
  });

  it("retains a failed add draft for retry and prevents duplicate pending submissions", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const realFetch = globalThis.fetch;
    const first = createDeferred<Response>();
    let attempts = 0;
    globalThis.fetch = vi.fn((input, init) => {
      if (init?.method === "POST") {
        attempts += 1;
        if (attempts === 1) {
          return first.promise;
        }
      }
      return realFetch(input, init);
    });
    const dialog = await screen.findByRole("dialog", { name: "Add manual observation" });
    const evidence = within(dialog).getByLabelText("Evidence");
    await actor.type(evidence, "Retry this evidence");
    const submit = within(dialog).getByRole("button", { name: "Add observation" });
    await actor.click(submit);
    expect(submit).toBeDisabled();
    await actor.click(submit);
    expect(attempts).toBe(1);
    first.resolve(responseWithError());
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to add observation");
    expect(evidence).toHaveValue("Retry this evidence");

    await actor.click(submit);
    await waitFor(() => expect(attempts).toBe(2));
  });

  it("rejects malformed weakness text without calling the observation lifecycle", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    const dialog = screen.getByRole("dialog", { name: "Add manual observation" });
    await actor.type(within(dialog).getByLabelText("Weakness identifiers"), "malformed");
    await actor.click(within(dialog).getByRole("button", { name: "Add observation" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Weakness identifiers must use namespace=identifier entries.",
    );
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("rejects a schema-invalid add draft without calling the observation lifecycle", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    const dialog = screen.getByRole("dialog", { name: "Add manual observation" });
    await actor.type(within(dialog).getByLabelText("Title"), " ");
    await actor.click(within(dialog).getByRole("button", { name: "Add observation" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /Unable to add observation\. title:/i,
    );
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("retains a failed correction draft, prevents dismissal, and retries with the same draft", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const storyFetch = globalThis.fetch;
    const first = createDeferred<Response>();
    const second = createDeferred<Response>();
    let attempts = 0;
    let retryRequest: [RequestInfo | URL, RequestInit | undefined] | undefined;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (requestPath(input).includes("/observations/") && init?.method === "PUT") {
        attempts += 1;
        if (attempts === 1) return first.promise;
        retryRequest = [input, init];
        return second.promise;
      }
      return storyFetch(input, init);
    });

    await actor.click(
      await screen.findByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Correct observation" });
    const title = within(dialog).getByLabelText("Title");
    await actor.clear(title);
    await actor.type(title, "Retry correction");
    const submit = within(dialog).getByRole("button", { name: "Save correction" });
    await actor.click(submit);
    await waitFor(() => expect(attempts).toBe(1));
    expect(submit).toBeDisabled();
    await actor.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Correct observation" })).toBeVisible();
    await actor.click(submit);
    expect(attempts).toBe(1);

    first.resolve(responseWithError());
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Unable to save observation. Try again.",
    );
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Retry correction");

    await actor.click(submit);
    await waitFor(() => expect(attempts).toBe(2));
    if (!retryRequest) throw new Error("Missing correction retry request");
    expect(parseRequestBody(retryRequest[1])).toEqual({
      title: "Retry correction",
      description: null,
      evidence: null,
      remediation: null,
      severity: "high",
      weakness: { identifiers: {} },
      affectedResource: { type: "unspecified" },
      observedAt: "2026-06-07T09:00:00.000Z",
    });
    expect(submit).toBeDisabled();
    await actor.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Correct observation" })).toBeVisible();

    second.resolve(await storyFetch(...retryRequest));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Correct observation" })).toBeNull(),
    );
    expect(screen.getByText("Retry correction")).toBeVisible();
  });

  it("retains a failed move target, prevents dismissal, and retries after the failure", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const storyFetch = globalThis.fetch;
    const first = createDeferred<Response>();
    const second = createDeferred<Response>();
    let attempts = 0;
    let retryRequest: [RequestInfo | URL, RequestInit | undefined] | undefined;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (requestPath(input).endsWith("/move") && init?.method === "POST") {
        attempts += 1;
        if (attempts === 1) return first.promise;
        retryRequest = [input, init];
        return second.promise;
      }
      return storyFetch(input, init);
    });

    await actor.click(
      await screen.findByRole("button", { name: "Move observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Move observation" });
    await actor.click(within(dialog).getByLabelText("Target finding"));
    await actor.click(await screen.findByRole("option", { name: "Target finding" }));
    const target = within(dialog).getByLabelText("Target finding");
    const submit = within(dialog).getByRole("button", { name: "Move observation" });
    await actor.click(submit);
    await waitFor(() => expect(attempts).toBe(1));
    expect(submit).toBeDisabled();
    await actor.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Move observation" })).toBeVisible();
    await actor.click(submit);
    expect(attempts).toBe(1);

    first.resolve(responseWithError());
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Unable to move observation. Try again.",
    );
    expect(target).toHaveTextContent("f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d");

    await actor.click(submit);
    await waitFor(() => expect(attempts).toBe(2));
    if (!retryRequest) throw new Error("Missing move retry request");
    expect(parseRequestBody(retryRequest[1])).toEqual({
      targetFindingId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    });
    expect(submit).toBeDisabled();
    await actor.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Move observation" })).toBeVisible();

    second.resolve(await storyFetch(...retryRequest));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Move observation" })).toBeNull(),
    );
    expect(screen.queryByText("Unspecified resource")).toBeNull();
  });

  it("cancels observation deletion without calling the lifecycle", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const fetchSpy = vi.fn(globalThis.fetch);
    globalThis.fetch = fetchSpy;
    const deleteButton = await screen.findByRole("button", {
      name: "Delete observation Unspecified resource",
    });
    await actor.click(deleteButton);
    const dialog = screen.getByRole("dialog", { name: "Delete observation" });
    await actor.click(within(dialog).getByRole("button", { name: "Keep observation" }));

    expect(screen.getByRole("heading", { name: "Unspecified resource" })).toBeVisible();
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("keeps an observation visible when deletion fails", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const storyFetch = globalThis.fetch;
    const failure = createDeferred<Response>();
    let deleteAttempts = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (requestPath(input).includes("/observations/") && init?.method === "DELETE") {
        deleteAttempts += 1;
        return failure.promise;
      }
      return storyFetch(input, init);
    });

    const deleteButton = await screen.findByRole("button", {
      name: "Delete observation Unspecified resource",
    });
    await actor.click(deleteButton);
    const dialog = screen.getByRole("dialog", { name: "Delete observation" });
    await actor.click(within(dialog).getByRole("button", { name: "Delete observation" }));
    await waitFor(() => expect(deleteAttempts).toBe(1));
    expect(deleteButton).toBeDisabled();

    failure.resolve(responseWithError());
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Unspecified resource" })).toBeVisible(),
    );
    expect(deleteButton).toBeEnabled();
  });

  it("resets a cancelled observation correction to the persisted values", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    await actor.click(
      await screen.findByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Correct observation" });
    await actor.clear(within(dialog).getByLabelText("Title"));
    await actor.type(within(dialog).getByLabelText("Title"), "Discarded observation");
    await actor.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Correct observation" })).toBeNull(),
    );

    await actor.click(
      screen.getByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const reopened = screen.getByRole("dialog", { name: "Correct observation" });
    expect(within(reopened).getByLabelText("Title")).toHaveValue("Unspecified resource");
    expect(within(reopened).getByLabelText("Affected resource type")).toHaveTextContent(
      "Unspecified resource",
    );
  });

  it("keeps observation correction open when validation fails", async () => {
    const actor = userEvent.setup();
    render(<Populated />);

    await actor.click(
      await screen.findByRole("button", { name: "Edit observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Correct observation" });
    await actor.clear(within(dialog).getByLabelText("Title"));
    await actor.click(within(dialog).getByRole("button", { name: "Save correction" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save observation");
    expect(screen.getByRole("dialog", { name: "Correct observation" })).toBeVisible();
  });

  it("confirms final observation deletion and keeps the parent finding empty", async () => {
    const actor = userEvent.setup();
    render(<DeleteFinalObservation />);

    await actor.click(
      await screen.findByRole("button", { name: "Delete observation Unspecified resource" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Delete observation" });
    expect(dialog).toHaveTextContent("The finding remains, even if this is its final observation.");
    await actor.click(within(dialog).getByRole("button", { name: "Keep observation" }));
    expect(screen.getByRole("heading", { name: "Unspecified resource" })).toBeVisible();

    await actor.click(
      screen.getByRole("button", { name: "Delete observation Unspecified resource" }),
    );
    dialog = screen.getByRole("dialog", { name: "Delete observation" });
    await actor.click(within(dialog).getByRole("button", { name: "Delete observation" }));

    expect(await screen.findByText("No observations recorded")).toBeVisible();
  });

  it("moves an observation to another finding and closes the parent-selection dialog", async () => {
    const actor = userEvent.setup();
    render(<Populated />);

    await actor.click(
      await screen.findByRole("button", { name: "Move observation Unspecified resource" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Move observation" });
    expect(within(dialog).getByLabelText("Target finding")).toBeVisible();
    await actor.click(within(dialog).getByLabelText("Target finding"));
    expect(screen.queryByRole("option", { name: "Exposed Admin Endpoint" })).toBeNull();
    await actor.click(await screen.findByRole("option", { name: /Target finding/ }));
    await actor.click(within(dialog).getByRole("button", { name: "Move observation" }));

    await waitFor(() => expect(screen.queryByText("Unspecified resource")).toBeNull());
    expect(screen.queryByRole("dialog", { name: "Move observation" })).toBeNull();
  });

  it("reports target loading errors and excludes the current parent", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((input, init) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === "/api/findings" && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Failed" }), { status: 500 }));
      }
      return realFetch(input, init);
    });
    await actor.click(
      await screen.findByRole("button", { name: "Move observation Unspecified resource" }),
    );

    expect(await screen.findByText("Target findings could not be loaded.")).toBeVisible();
    expect(screen.getByLabelText("Target finding")).toBeDisabled();
  });

  it("disables moving when no target finding is available", async () => {
    const actor = userEvent.setup();
    render(<Populated />);
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((input, init) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === "/api/findings" && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { items: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return realFetch(input, init);
    });
    await actor.click(
      await screen.findByRole("button", { name: "Move observation Unspecified resource" }),
    );

    expect(await screen.findByText("No other findings are available.")).toBeVisible();
    expect(screen.getByLabelText("Target finding")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move observation" })).toBeDisabled();
  });

  it("retries an observations query from its error state", async () => {
    const actor = userEvent.setup();
    render(<ErrorState />);
    await screen.findByRole("alert");
    const storyFetch = globalThis.fetch;
    const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path.includes("/observations") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { items: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return storyFetch(input, init);
    });
    globalThis.fetch = fetchSpy;

    await actor.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("No observations recorded")).toBeVisible();
    expect(
      fetchSpy.mock.calls.some(([input, init]) => {
        const path = requestPath(input);
        return path.includes("/observations") && (init?.method ?? "GET") === "GET";
      }),
    ).toBe(true);
  });
});
