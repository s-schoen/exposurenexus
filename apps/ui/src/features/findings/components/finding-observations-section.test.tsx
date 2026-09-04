import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as stories from "@/features/findings/components/finding-observations-section.stories.tsx";

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
    let resolveFirst!: (response: Response) => void;
    let attempts = 0;
    globalThis.fetch = vi.fn((input, init) => {
      if (init?.method === "POST") {
        attempts += 1;
        if (attempts === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          });
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
    resolveFirst(new Response(JSON.stringify({ error: "Failed" }), { status: 500 }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to add observation");
    expect(evidence).toHaveValue("Retry this evidence");

    await actor.click(submit);
    await waitFor(() => expect(attempts).toBe(2));
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
