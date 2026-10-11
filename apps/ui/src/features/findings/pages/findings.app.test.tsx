import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SEED_ASSETS,
  SEED_FINDINGS,
  SEED_USERS,
  SEED_VULNERABILITIES,
} from "@/mocks/fixtures/index.ts";
import { db, holdApiResponses, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const [ADMIN_ENDPOINT, OUTDATED_DEPENDENCY, ROOT_CONTAINER, WEAK_TLS] = SEED_FINDINGS;
const [WEB_01, CONTAINER_01, API_WORKER] = SEED_ASSETS;
const [ADMIN_ENDPOINT_CVE, ACCOUNT_TAKEOVER] = SEED_VULNERABILITIES;
const [, MORGAN] = SEED_USERS;

async function findRow(title: string) {
  return (await screen.findByText(title)).closest("li")!;
}

function rowTitles(list: HTMLElement) {
  return within(list)
    .getAllByRole("listitem")
    .map((row) => within(row).getByRole("link").textContent);
}

describe("findings list", () => {
  it("lists the findings as rows that link to their pages", async () => {
    renderApp({ path: "/findings" });

    const list = await screen.findByRole("list", { name: "Findings" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(SEED_FINDINGS.length);
    expect(within(list).getByRole("link", { name: ADMIN_ENDPOINT.title })).toHaveAttribute(
      "href",
      `/findings/${ADMIN_ENDPOINT.id}`,
    );
  });

  it("keeps the search filter in the URL", async () => {
    const { router, user } = renderApp({ path: "/findings" });

    // Paste: the input is driven by the URL, so per-keystroke typing races the navigation.
    await user.click(await screen.findByRole("textbox", { name: "Search" }));
    await user.paste("tls");

    await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "tls" }));
    await waitFor(() => expect(screen.queryByText(ADMIN_ENDPOINT.title)).not.toBeInTheDocument());
    expect(screen.getByText(WEAK_TLS.title)).toBeVisible();
  });

  it("filters through the Filters menu and clears a filter from its chip", async () => {
    const { router, user } = renderApp({ path: "/findings" });

    await user.click(await screen.findByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("option", { name: "Mitigated" }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ status: FindingStatus.Mitigated }),
    );
    await waitFor(() =>
      expect(rowTitles(screen.getByRole("list", { name: "Findings" }))).toEqual([WEAK_TLS.title]),
    );

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Clear Status filter Mitigated" }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("status"));
  });

  it("offers to clear the filters when nothing matches", async () => {
    const { router, user } = renderApp({ path: "/findings?filter=nothing-matches" });

    await user.click(await screen.findByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("filter"));
    expect(await screen.findByText(ADMIN_ENDPOINT.title)).toBeVisible();
  });

  it("shows an empty state without findings", async () => {
    renderApp({ path: "/findings", scenario: "empty" });

    expect(await screen.findByText("No findings yet.")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Findings" })).not.toBeInTheDocument();
  });

  it("groups by status from the Display menu, keeps it in the URL and collapses a group", async () => {
    const { router, user } = renderApp({ path: "/findings" });

    await user.click(await screen.findByRole("button", { name: "Display" }));
    await user.click(screen.getByRole("combobox", { name: "Group by" }));
    await user.click(await screen.findByRole("option", { name: "Status" }));

    await waitFor(() => expect(router.state.location.search).toMatchObject({ group: "status" }));
    const active = await screen.findByRole("list", { name: "Active" });
    expect(rowTitles(active).sort()).toEqual([ROOT_CONTAINER.title, ADMIN_ENDPOINT.title]);
    expect(rowTitles(screen.getByRole("list", { name: "Mitigated" }))).toEqual([WEAK_TLS.title]);

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /^Active/ }));
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Active" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("list", { name: "Confirmed" })).toBeVisible();
  });

  it("orders rows and hides properties from the Display menu", async () => {
    const { user } = renderApp({ path: "/findings" });

    await user.click(await screen.findByRole("button", { name: "Display" }));
    await user.click(screen.getByRole("combobox", { name: "Order by" }));
    await user.click(await screen.findByRole("option", { name: "Title" }));
    const titles = SEED_FINDINGS.map((finding) => finding.title).sort((left, right) =>
      left.localeCompare(right),
    );
    // The newest-first default is descending, and a new order keeps the direction.
    await waitFor(() =>
      expect(rowTitles(screen.getByRole("list", { name: "Findings" }))).toEqual(
        [...titles].reverse(),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Descending order" }));
    expect(rowTitles(screen.getByRole("list", { name: "Findings" }))).toEqual(titles);

    const list = screen.getByRole("list", { name: "Findings" });
    expect(within(list).getAllByText(WEB_01.displayName)).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Asset", pressed: true }));
    expect(within(list).queryByText(WEB_01.displayName)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asset", pressed: false })).toBeVisible();
  });

  it("marks the row whose preview is open", async () => {
    renderApp({ path: `/findings?selected=${ROOT_CONTAINER.id}` });

    expect(await findRow(ROOT_CONTAINER.title)).toHaveAttribute("aria-current", "true");
    expect(await findRow(WEAK_TLS.title)).not.toHaveAttribute("aria-current");
  });

  it("opens the create page from the toolbar", async () => {
    const { router, user } = renderApp({ path: "/findings" });

    await user.click(await screen.findByRole("button", { name: "New finding" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/findings/new"));
  });

  it("previews a selected finding, fetching it only once selected, and closes again", async () => {
    const requests = recordApiRequests();
    const { router, user } = renderApp({ path: "/findings" });

    await user.click(await screen.findByText(ROOT_CONTAINER.title));

    const dialog = await screen.findByRole("dialog", { name: "Finding details" });
    expect((await within(dialog).findAllByText(ROOT_CONTAINER.title)).length).toBeGreaterThan(0);
    expect(router.state.location.search).toMatchObject({ selected: ROOT_CONTAINER.id });
    expect(requests).toContain(`GET /api/findings/${ROOT_CONTAINER.id}`);
    expect(requests).not.toContain(`GET /api/findings/${ADMIN_ENDPOINT.id}`);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("selected"));
  });

  it("keeps a preview failure inside the dialog", async () => {
    mockApiError("get", `/findings/${ROOT_CONTAINER.id}`, 500, "Finding request failed");
    renderApp({ path: `/findings?selected=${ROOT_CONTAINER.id}` });

    const dialog = await screen.findByRole("dialog", { name: "Finding details" });
    expect(await within(dialog).findByText("Finding request failed")).toBeVisible();
    expect(screen.getByText(WEAK_TLS.title)).toBeInTheDocument();
  });

  it("opens a finding's page on double click", async () => {
    const { router, user } = renderApp({ path: "/findings" });

    await user.dblClick(await screen.findByText(WEAK_TLS.title));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/findings/${WEAK_TLS.id}`));
  });

  it("deletes confirmed findings and keeps them when cancelled", async () => {
    const { user } = renderApp({ path: "/findings" });

    await user.click(
      within(await findRow(WEAK_TLS.title)).getByRole("checkbox", { name: "Select row" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(db.findings.get(WEAK_TLS.id)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.findings.get(WEAK_TLS.id)).toBeUndefined());
    expect(db.findings.get(ADMIN_ENDPOINT.id)).toBeDefined();
  });

  it("deletes a finding from the row context menu", async () => {
    const { user } = renderApp({ path: "/findings" });

    await user.pointer({ keys: "[MouseRight]", target: await findRow(WEAK_TLS.title) });
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.findings.get(WEAK_TLS.id)).toBeUndefined());
  });
});

describe("triage queue", () => {
  it("defaults to active findings", async () => {
    const { router } = renderApp({ path: "/findings/triage" });

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ status: FindingStatus.Active }),
    );
    expect(await screen.findByText(ADMIN_ENDPOINT.title)).toBeVisible();
    expect(screen.getByText(ROOT_CONTAINER.title)).toBeVisible();
    await waitFor(() => expect(screen.queryByText(WEAK_TLS.title)).not.toBeInTheDocument());
    expect(screen.queryByText(OUTDATED_DEPENDENCY.title)).not.toBeInTheDocument();
  });

  it("groups by asset unless the URL picks another grouping", async () => {
    const { router, user } = renderApp({ path: "/findings/triage" });

    expect(rowTitles(await screen.findByRole("list", { name: CONTAINER_01.displayName }))).toEqual([
      ROOT_CONTAINER.title,
    ]);
    expect(rowTitles(screen.getByRole("list", { name: WEB_01.displayName }))).toEqual([
      ADMIN_ENDPOINT.title,
    ]);
    expect(router.state.location.search).not.toHaveProperty("group");

    await user.click(screen.getByRole("button", { name: "Display" }));
    await user.click(screen.getByRole("combobox", { name: "Group by" }));
    await user.click(await screen.findByRole("option", { name: "None" }));

    await waitFor(() => expect(router.state.location.search).toMatchObject({ group: "none" }));
    expect(await screen.findByRole("list", { name: "Findings" })).toBeVisible();
  });

  it("keeps an explicit status filter", async () => {
    const { router } = renderApp({ path: "/findings/triage?status=mitigated" });

    expect(await screen.findByText(WEAK_TLS.title)).toBeVisible();
    expect(router.state.location.search).toMatchObject({ status: FindingStatus.Mitigated });
    expect(screen.queryByText(ADMIN_ENDPOINT.title)).not.toBeInTheDocument();
  });
});

describe("finding detail", () => {
  it("shows the finding with its asset, assignee and catalog entries", async () => {
    renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    expect(
      await screen.findByRole("heading", { level: 1, name: ADMIN_ENDPOINT.title }),
    ).toBeVisible();
    expect(await screen.findByRole("link", { name: `Open ${WEB_01.displayName}` })).toHaveAttribute(
      "href",
      `/assets/${WEB_01.id}`,
    );
    expect((await screen.findAllByText(MORGAN.displayName)).length).toBeGreaterThan(0);
    expect(screen.getByText(ADMIN_ENDPOINT_CVE.title)).toBeVisible();
  });

  it("goes back to the findings list", async () => {
    const { router, user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(
      within(await screen.findByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "Findings",
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/findings"));
  });

  it("saves a correction and closes the dialog", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "Edit finding" }));
    const dialog = await screen.findByRole("dialog", { name: "Correct finding" });
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Exposed admin console");
    await user.click(within(dialog).getByRole("button", { name: "Save correction" }));

    await waitFor(() =>
      expect(db.findings.get(ADMIN_ENDPOINT.id)?.title).toBe("Exposed admin console"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      await screen.findByRole("heading", { level: 1, name: "Exposed admin console" }),
    ).toBeVisible();
  });

  it("keeps the correction open on validation errors and failed saves", async () => {
    mockApiError("put", "/findings/:id", 500);
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "Edit finding" }));
    const dialog = await screen.findByRole("dialog", { name: "Correct finding" });
    await user.clear(within(dialog).getByLabelText("Title"));
    await user.click(within(dialog).getByRole("button", { name: "Save correction" }));
    expect(await within(dialog).findByText(/^Unable to save correction\. title:/)).toBeVisible();

    await user.type(within(dialog).getByLabelText("Title"), "Exposed admin console");
    await user.click(within(dialog).getByRole("button", { name: "Save correction" }));
    expect(await within(dialog).findByText("Unable to save correction. Try again.")).toBeVisible();
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.title).toBe(ADMIN_ENDPOINT.title);
  });

  it("links a catalog entry, guarding against duplicate submits while pending", async () => {
    const pending = holdApiResponses("put", "/findings/:id/vulnerabilities/:vulnerabilityId");
    const requests = recordApiRequests();
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    // The select stays disabled until the catalog has loaded.
    const catalog = await screen.findByLabelText("Link catalog entry");
    await waitFor(() => expect(catalog).not.toHaveAttribute("data-disabled"));
    await user.click(catalog);
    await user.click(
      await screen.findByRole("option", { name: new RegExp(ACCOUNT_TAKEOVER.identifier) }),
    );
    await user.click(screen.getByRole("button", { name: "Link entry" }));
    // While pending the button shows a spinner instead of its label and cannot be used again.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Link entry" })).not.toBeInTheDocument(),
    );

    pending.release();
    expect(await screen.findByText(ACCOUNT_TAKEOVER.title)).toBeVisible();
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.vulnerabilityIds).toEqual([
      ADMIN_ENDPOINT_CVE.id,
      ACCOUNT_TAKEOVER.id,
    ]);
    expect(screen.getByLabelText("Link catalog entry")).toHaveTextContent("Select a catalog entry");
    expect(requests.filter((request) => request.startsWith("PUT"))).toHaveLength(1);
  });

  it("unlinks a catalog entry only after confirmation", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "Unlink" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.vulnerabilityIds).toEqual([ADMIN_ENDPOINT_CVE.id]);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Unlink" })).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Unlink" }));
    // The modal confirmation hides the row's button, leaving only its own "Unlink".
    await screen.findByRole("button", { name: "Cancel" });
    await user.click(screen.getByRole("button", { name: "Unlink" }));

    await waitFor(() => expect(db.findings.get(ADMIN_ENDPOINT.id)?.vulnerabilityIds).toEqual([]));
    expect(await screen.findByText("No catalog entries are linked.")).toBeVisible();
  });
});

describe("creating findings", () => {
  async function openCreatePage() {
    const view = renderApp({ path: "/findings" });
    await view.user.click(await screen.findByRole("button", { name: "New finding" }));
    await screen.findByLabelText("Title");
    return view;
  }

  async function fillRequiredFields(user: ReturnType<typeof renderApp>["user"]) {
    await user.type(screen.getByLabelText("Title"), "  Hard-coded secret  ");
    const asset = screen.getByRole("combobox", { name: "Affected Asset" });
    await waitFor(() => expect(asset).toBeEnabled());
    await user.click(asset);
    await user.click(
      await screen.findByRole("option", { name: new RegExp(API_WORKER.displayName) }),
    );
  }

  it("creates a finding with its initial observation and returns to the list", async () => {
    const { router, user } = await openCreatePage();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Create finding" }));

    await waitFor(() =>
      expect(
        db.findings.all().find((finding) => finding.title === "Hard-coded secret"),
      ).toMatchObject({ assetId: API_WORKER.id, status: FindingStatus.Active }),
    );
    const created = db.findings.all().find((finding) => finding.title === "Hard-coded secret")!;
    expect(
      db.observations.all().filter((observation) => observation.findingId === created.id),
    ).toHaveLength(1);
    await waitFor(() => expect(router.state.location.pathname).toBe("/findings"));
  });

  it("creates a finding with its identity and initial observation details", async () => {
    const { user } = await openCreatePage();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("tab", { name: "Identity" }));
    await user.type(screen.getByLabelText("Weakness identifiers"), "cwe=CWE-798");
    // A field of another resource type is dropped when the type changes.
    await user.click(screen.getByLabelText("Affected resource"));
    await user.click(await screen.findByRole("option", { name: "Network service" }));
    await user.type(screen.getByLabelText("Host"), "10.0.0.5");
    await user.click(screen.getByLabelText("Affected resource"));
    await user.click(await screen.findByRole("option", { name: "Source code" }));
    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Repository"), "github.com/acme/api");
    await user.type(screen.getByLabelText("File"), "src/config.ts");
    await user.type(screen.getByLabelText("Start line"), "42");
    await user.type(screen.getByLabelText("Catalog entry IDs"), ACCOUNT_TAKEOVER.id);

    await user.click(screen.getByRole("tab", { name: "Observation" }));
    await user.type(screen.getByLabelText("Observation title"), "Secret in config");
    await user.type(screen.getByLabelText("Evidence"), "API_KEY=…");
    await user.click(screen.getByRole("button", { name: "Create finding" }));

    const created = await waitFor(() => {
      const finding = db.findings
        .all()
        .find((candidate) => candidate.title === "Hard-coded secret");
      expect(finding).toBeDefined();
      return finding!;
    });
    expect(created).toMatchObject({
      weakness: { identifiers: { cwe: ["CWE-798"] } },
      affectedResource: {
        type: AffectedResourceType.SourceCode,
        repository: "github.com/acme/api",
        file: "src/config.ts",
        location: { startLine: 42 },
      },
      vulnerabilityIds: [ACCOUNT_TAKEOVER.id],
    });
    expect(created.affectedResource).not.toHaveProperty("host");
    expect(
      db.observations.all().find((observation) => observation.findingId === created.id),
    ).toMatchObject({ title: "Secret in config", evidence: "API_KEY=…" });
  });

  it("does not submit without the required fields", async () => {
    const requests = recordApiRequests();
    const { router, user } = await openCreatePage();

    await user.click(screen.getByRole("button", { name: "Create finding" }));

    expect(router.state.location.pathname).toBe("/findings/new");
    expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("stays on the form when creating fails, and cancels back", async () => {
    mockApiError("post", "/findings", 500, "Create failed");
    const { router, user } = await openCreatePage();

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Create finding" }));
    expect((await screen.findAllByText(/Create failed/)).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe("/findings/new");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/findings"));
    expect(db.findings.all()).toHaveLength(SEED_FINDINGS.length);
  });
});
