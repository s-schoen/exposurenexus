import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatDate } from "@/lib/format.ts";
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

// The sidebar has a "New finding" button too; this is the one in the page header.
async function clickNewFinding(user: ReturnType<typeof renderApp>["user"]) {
  const [shell] = await screen.findAllByRole("main");
  await user.click(await within(shell).findByRole("button", { name: "New finding" }));
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

  it("opens the create dialog from the page header without leaving the list", async () => {
    const { router, user } = renderApp({ path: "/findings" });

    await clickNewFinding(user);

    expect(await screen.findByRole("dialog", { name: "Create finding" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/findings");
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
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the peek open over the list and swaps it to another row", async () => {
    const { router, user } = renderApp({ path: `/findings?selected=${ROOT_CONTAINER.id}` });
    const dialog = await screen.findByRole("dialog", { name: "Finding details" });

    // The peek is not modal: the list stays in the accessibility tree and clickable.
    const list = screen.getByRole("list", { name: "Findings" });
    await user.click(within(list).getByRole("link", { name: WEAK_TLS.title }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ selected: WEAK_TLS.id }),
    );
    expect(screen.getByRole("dialog", { name: "Finding details" })).toBe(dialog);
    expect((await within(dialog).findAllByText(WEAK_TLS.title)).length).toBeGreaterThan(0);
    const rowOf = (title: string) => within(list).getByText(title).closest("li");
    expect(rowOf(WEAK_TLS.title)).toHaveAttribute("aria-current", "true");
    expect(rowOf(ROOT_CONTAINER.title)).not.toHaveAttribute("aria-current");
    expect(within(dialog).getByRole("link", { name: "Open full page" })).toHaveAttribute(
      "href",
      `/findings/${WEAK_TLS.id}`,
    );
  });

  it("moves focus into the peek and back to the row when it closes", async () => {
    const { router, user } = renderApp({ path: "/findings" });
    const rowLink = await screen.findByRole("link", { name: ROOT_CONTAINER.title });

    await user.click(rowLink);

    const dialog = await screen.findByRole("dialog", { name: "Finding details" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("selected"));
    await waitFor(() => expect(rowLink).toHaveFocus());
  });

  it("copies a link to the finding's page from the peek", async () => {
    const { user } = renderApp({ path: `/findings?selected=${ROOT_CONTAINER.id}` });
    const dialog = await screen.findByRole("dialog", { name: "Finding details" });

    await user.click(within(dialog).getByRole("button", { name: "Copy link" }));

    expect(await screen.findByText("Link copied")).toBeVisible();
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/findings/${ROOT_CONTAINER.id}`,
    );
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

  it("opens a finding from the row context menu, in the peek or a new tab", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { router, user } = renderApp({ path: "/findings" });

    await user.pointer({ keys: "[MouseRight]", target: await findRow(WEAK_TLS.title) });
    await user.click(await screen.findByRole("menuitem", { name: "Open in new tab" }));
    expect(open).toHaveBeenCalledWith(`/findings/${WEAK_TLS.id}`, "_blank", "noopener");

    await user.pointer({ keys: "[MouseRight]", target: await findRow(WEAK_TLS.title) });
    await user.click(await screen.findByRole("menuitem", { name: "Open" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ selected: WEAK_TLS.id }),
    );
  });

  it("applies the row context menu to the whole selection", async () => {
    const { user } = renderApp({ path: "/findings" });

    await user.click(within(await findRow(WEAK_TLS.title)).getByRole("checkbox"));
    await user.click(within(await findRow(ADMIN_ENDPOINT.title)).getByRole("checkbox"));
    await user.pointer({ keys: "[MouseRight]", target: await findRow(WEAK_TLS.title) });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("2 selected")).toBeVisible();
    expect(within(menu).queryByRole("menuitem", { name: "Open" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.findings.get(WEAK_TLS.id)).toBeUndefined());
    expect(db.findings.get(ADMIN_ENDPOINT.id)).toBeUndefined();
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
    const properties = screen.getByRole("region", { name: "Properties" });
    expect(within(properties).getByRole("link", { name: WEB_01.displayName })).toHaveAttribute(
      "href",
      `/assets/${WEB_01.id}`,
    );
    await waitFor(() =>
      expect(within(properties).getByRole("button", { name: /^Assignee/ })).toHaveTextContent(
        MORGAN.displayName,
      ),
    );
    expect(screen.getByRole("link", { name: ADMIN_ENDPOINT_CVE.title })).toBeVisible();
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

  it("edits status, severity and assignee in place", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });
    const properties = await screen.findByRole("region", { name: "Properties" });

    const status = within(properties).getByRole("button", { name: /^Status/ });
    await user.click(status);
    await user.click(await screen.findByRole("option", { name: "Mitigated" }));
    expect(status).toHaveTextContent("Mitigated");
    await waitFor(() =>
      expect(db.findings.get(ADMIN_ENDPOINT.id)?.status).toBe(FindingStatus.Mitigated),
    );

    await user.click(within(properties).getByRole("button", { name: /^Severity/ }));
    await user.click(await screen.findByRole("option", { name: "Low" }));
    await waitFor(() =>
      expect(db.findings.get(ADMIN_ENDPOINT.id)?.severity).toBe(VulnerabilitySeverity.Low),
    );

    await user.click(within(properties).getByRole("button", { name: /^Assignee/ }));
    await user.click(await screen.findByRole("option", { name: "Unassigned" }));
    await waitFor(() => expect(db.findings.get(ADMIN_ENDPOINT.id)?.assigneeId).toBeNull());
    expect(within(properties).getByRole("button", { name: /^Assignee/ })).toHaveTextContent(
      "Unassigned",
    );
  });

  it("sets and clears the due date in place with a calendar", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });
    const properties = await screen.findByRole("region", { name: "Properties" });
    const dueDate = within(properties).getByRole("button", { name: /^Due date/ });
    expect(dueDate).toHaveTextContent(formatDate(ADMIN_ENDPOINT.dueDate!, { timeZone: "UTC" }));

    // The calendar opens on the current due date's month; Escape closes it unchanged.
    await user.click(dueDate);
    expect(
      await screen.findByRole("button", { name: /February 1st, 2026, selected/ }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.dueDate).toEqual(ADMIN_ENDPOINT.dueDate);

    await user.click(dueDate);
    await user.click(await screen.findByRole("button", { name: /February 15th, 2026/ }));
    await waitFor(() =>
      expect(db.findings.get(ADMIN_ENDPOINT.id)?.dueDate).toEqual(
        new Date("2026-02-15T00:00:00.000Z"),
      ),
    );

    await user.click(dueDate);
    await user.click(await screen.findByRole("button", { name: "Clear" }));
    await waitFor(() => expect(db.findings.get(ADMIN_ENDPOINT.id)?.dueDate).toBeNull());
    expect(dueDate).toHaveTextContent("No due date");
  });

  it("updates the list row and the triage count after an inline edit in the peek", async () => {
    const { user } = renderApp({ path: `/findings?selected=${ADMIN_ENDPOINT.id}` });
    const triage = await screen.findByRole("link", { name: /Triage/ });
    await waitFor(() => expect(triage).toHaveTextContent("2"));
    const peek = await screen.findByRole("dialog", { name: "Finding details" });

    await user.click(await within(peek).findByRole("button", { name: /^Status/ }));
    await user.click(await screen.findByRole("option", { name: "Mitigated" }));

    await waitFor(() => expect(triage).toHaveTextContent("1"));
    const row = within(screen.getByRole("list", { name: "Findings" }))
      .getByText(ADMIN_ENDPOINT.title)
      .closest("li")!;
    expect(within(row).getByText("Mitigated")).toBeVisible();
  });

  it("reverts a failed inline edit and shows the error", async () => {
    mockApiError("put", "/findings/:id", 500);
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });
    const properties = await screen.findByRole("region", { name: "Properties" });
    const status = within(properties).getByRole("button", { name: /^Status/ });

    await user.click(status);
    await user.click(await screen.findByRole("option", { name: "Mitigated" }));

    expect(await screen.findByText("Failed to update finding")).toBeVisible();
    await waitFor(() => expect(status).toHaveTextContent("Active"));
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.status).toBe(FindingStatus.Active);
  });

  it("edits the title in place", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });
    const heading = await screen.findByRole("heading", { level: 2, name: ADMIN_ENDPOINT.title });

    await user.click(within(heading).getByRole("button", { name: ADMIN_ENDPOINT.title }));
    const input = within(heading).getByRole("textbox", { name: "Edit value" });
    await user.clear(input);
    await user.type(input, "Exposed admin console{Enter}");

    await waitFor(() =>
      expect(db.findings.get(ADMIN_ENDPOINT.id)?.title).toBe("Exposed admin console"),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Exposed admin console" }),
    ).toBeVisible();
  });

  it("keeps the title when it is cleared in place", async () => {
    const requests = recordApiRequests();
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });
    const heading = await screen.findByRole("heading", { level: 2, name: ADMIN_ENDPOINT.title });

    await user.click(within(heading).getByRole("button", { name: ADMIN_ENDPOINT.title }));
    await user.clear(within(heading).getByRole("textbox", { name: "Edit value" }));
    await user.keyboard("{Enter}");

    expect(await within(heading).findByText(ADMIN_ENDPOINT.title)).toBeVisible();
    expect([...requests]).not.toContain(`PUT /api/findings/${ADMIN_ENDPOINT.id}`);
  });

  it("edits the details from the header menu and closes the dialog", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit details…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit details" });
    expect(within(dialog).queryByLabelText("Status")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Title")).not.toBeInTheDocument();
    const mitigation = within(dialog).getByLabelText("Mitigation");
    await user.clear(mitigation);
    await user.type(mitigation, "Restrict the admin endpoint.");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(db.findings.get(ADMIN_ENDPOINT.id)?.mitigation).toBe("Restrict the admin endpoint."),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Restrict the admin endpoint.")).toBeVisible();
  });

  it("edits the details from the peek's menu", async () => {
    const { user } = renderApp({ path: `/findings?selected=${ADMIN_ENDPOINT.id}` });
    const peek = await screen.findByRole("dialog", { name: "Finding details" });

    await user.click(await within(peek).findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit details…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit details" });
    await user.clear(within(dialog).getByLabelText("Mitigation"));
    await user.type(within(dialog).getByLabelText("Mitigation"), "Restrict the admin endpoint.");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(db.findings.get(ADMIN_ENDPOINT.id)?.mitigation).toBe("Restrict the admin endpoint."),
    );
  });

  it("keeps the details dialog open on validation errors and failed saves", async () => {
    mockApiError("put", "/findings/:id", 500);
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit details…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit details" });
    const weakness = within(dialog).getByLabelText("Weakness identifiers");
    await user.clear(weakness);
    await user.type(weakness, "not an identifier");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(
        "Weakness identifiers must use namespace=identifier entries.",
      ),
    ).toBeVisible();

    await user.clear(weakness);
    await user.type(weakness, "cwe=CWE-200");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Unable to save correction. Try again.")).toBeVisible();
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.weakness).toEqual(ADMIN_ENDPOINT.weakness);
  });

  it("keeps the details draft on a backdrop click", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit details…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit details" });
    await user.clear(within(dialog).getByLabelText("Mitigation"));
    await user.type(within(dialog).getByLabelText("Mitigation"), "Draft");
    await user.click(document.querySelector<HTMLElement>("[data-slot='dialog-overlay']")!);

    expect(dialog).toBeVisible();
    expect(within(dialog).getByLabelText("Mitigation")).toHaveValue("Draft");
  });

  it("deletes the finding from its header menu and returns to the list", async () => {
    const { router, user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete finding…" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/findings"));
    expect(db.findings.get(ADMIN_ENDPOINT.id)).toBeUndefined();
    expect(await screen.findByRole("list", { name: "Findings" })).toBeVisible();
  });

  it("deletes the finding from the peek's menu and closes the peek", async () => {
    const { router, user } = renderApp({ path: `/findings?selected=${ADMIN_ENDPOINT.id}` });
    const peek = await screen.findByRole("dialog", { name: "Finding details" });

    await user.click(await within(peek).findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete finding…" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("selected"));
    expect(db.findings.get(ADMIN_ENDPOINT.id)).toBeUndefined();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Finding details" })).not.toBeInTheDocument(),
    );
  });

  it("collapses a section", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });
    const section = await screen.findByRole("button", { name: /^Vulnerabilities/ });
    expect(screen.getByRole("link", { name: ADMIN_ENDPOINT_CVE.title })).toBeVisible();

    await user.click(section);

    expect(section).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: ADMIN_ENDPOINT_CVE.title })).not.toBeInTheDocument();
  });

  it("links a catalog entry, guarding against duplicate submits while pending", async () => {
    const pending = holdApiResponses("put", "/findings/:id/vulnerabilities/:vulnerabilityId");
    const requests = recordApiRequests();
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    const link = await screen.findByRole("button", { name: "Link catalog entry" });
    await user.click(link);
    await user.click(
      await screen.findByRole("option", { name: new RegExp(ACCOUNT_TAKEOVER.identifier) }),
    );
    // While pending the button is disabled and cannot be used again.
    await waitFor(() => expect(link).toBeDisabled());

    pending.release();
    expect(await screen.findByRole("link", { name: ACCOUNT_TAKEOVER.title })).toBeVisible();
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.vulnerabilityIds).toEqual([
      ADMIN_ENDPOINT_CVE.id,
      ACCOUNT_TAKEOVER.id,
    ]);
    await waitFor(() => expect(link).toBeEnabled());
    expect(requests.filter((request) => request.startsWith("PUT"))).toHaveLength(1);
  });

  it("unlinks a catalog entry only after confirmation", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });
    const unlink = await screen.findByRole("button", {
      name: `Unlink ${ADMIN_ENDPOINT_CVE.identifier}`,
    });

    await user.click(unlink);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(db.findings.get(ADMIN_ENDPOINT.id)?.vulnerabilityIds).toEqual([ADMIN_ENDPOINT_CVE.id]);

    await waitFor(() => expect(unlink).toBeVisible());
    await user.click(unlink);
    await user.click(await screen.findByRole("button", { name: "Unlink" }));

    await waitFor(() => expect(db.findings.get(ADMIN_ENDPOINT.id)?.vulnerabilityIds).toEqual([]));
    expect(await screen.findByText("No catalog entries are linked.")).toBeVisible();
  });
});

describe("creating findings", () => {
  async function openCreateDialog() {
    const view = renderApp({ path: "/findings" });
    await clickNewFinding(view.user);
    const dialog = await screen.findByRole("dialog", { name: "Create finding" });
    await within(dialog).findByLabelText("Title");
    return { ...view, dialog };
  }

  async function fillRequiredFields(user: ReturnType<typeof renderApp>["user"]) {
    await user.type(screen.getByLabelText("Title"), "  Hard-coded secret  ");
    const asset = screen.getByRole("combobox", { name: "Affected asset" });
    await waitFor(() => expect(asset).toBeEnabled());
    await user.click(asset);
    await user.click(
      await screen.findByRole("option", { name: new RegExp(API_WORKER.displayName) }),
    );
  }

  it("creates a finding with its initial observation and opens it", async () => {
    const { router, user } = await openCreateDialog();

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
    await waitFor(() => expect(router.state.location.pathname).toBe(`/findings/${created.id}`));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Hard-coded secret" }),
    ).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Create finding" })).not.toBeInTheDocument();
  });

  it("creates a finding with its identity and initial observation details", async () => {
    const { user } = await openCreateDialog();

    await fillRequiredFields(user);
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
    // Let the app finish opening the new finding before the test ends.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Hard-coded secret" }),
    ).toBeVisible();
  });

  it("does not submit without the required fields", async () => {
    const requests = recordApiRequests();
    const { router, user, dialog } = await openCreateDialog();

    await user.click(within(dialog).getByRole("button", { name: "Create finding" }));

    expect(await within(dialog).findAllByRole("alert")).not.toHaveLength(0);
    expect(router.state.location.pathname).toBe("/findings");
    expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("keeps the dialog and its draft when creating fails, and cancels", async () => {
    mockApiError("post", "/findings", 500, "Create failed");
    const { router, user, dialog } = await openCreateDialog();

    await fillRequiredFields(user);
    await user.click(within(dialog).getByRole("button", { name: "Create finding" }));
    expect((await screen.findAllByText(/Create failed/)).length).toBeGreaterThan(0);
    expect(within(dialog).getByLabelText("Title")).toHaveValue("  Hard-coded secret  ");

    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled(),
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/findings");
    expect(db.findings.all()).toHaveLength(SEED_FINDINGS.length);
  });

  it("opens the create dialog from the sidebar on any page", async () => {
    const { router, user } = renderApp({ path: "/assets" });
    const sidebarButton = await waitFor(() => {
      const [button] = screen
        .getAllByRole("button", { name: "New finding" })
        .filter((candidate) => !candidate.closest("main"));
      expect(button).toBeDefined();
      return button;
    });

    await user.click(sidebarButton);

    expect(await screen.findByRole("dialog", { name: "Create finding" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/assets");
  });
});

describe("importing findings", () => {
  it("shows the import form in the page column", async () => {
    renderApp({ path: "/findings/import" });

    expect(await screen.findByRole("heading", { level: 1, name: "Import findings" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Import findings unavailable" })).toBeDisabled();
  });
});
