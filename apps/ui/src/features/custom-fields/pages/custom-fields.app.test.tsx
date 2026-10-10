import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SEED_CUSTOM_FIELDS } from "@/mocks/fixtures/index.ts";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const [CATEGORY, PRIORITY, DEPLOYMENT_TIER] = SEED_CUSTOM_FIELDS;

async function fillTextField(user: ReturnType<typeof renderApp>["user"]) {
  await user.type(await screen.findByRole("textbox", { name: /^name$/i }), "  Risk Owner  ");
  await user.type(screen.getByRole("textbox", { name: /^key$/i }), "  risk_owner  ");
  await user.click(screen.getByRole("checkbox", { name: /required/i }));
  await user.type(screen.getByRole("textbox", { name: /default value/i }), "Security");
}

describe("custom fields list", () => {
  it("lists the definitions", async () => {
    renderApp({ path: "/custom-fields" });

    for (const field of SEED_CUSTOM_FIELDS) {
      expect(await screen.findByText(field.name)).toBeVisible();
    }
  });

  it("keeps the search filter in the URL", async () => {
    const { router, user } = renderApp({ path: "/custom-fields" });

    // Paste: the input is driven by the URL, so per-keystroke typing races the navigation.
    await user.click(await screen.findByLabelText("Search across visible columns"));
    await user.paste("tier");

    await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "tier" }));
    await waitFor(() => expect(screen.queryByText(CATEGORY.name)).not.toBeInTheDocument());
    expect(screen.getByText(DEPLOYMENT_TIER.name)).toBeVisible();
  });

  it("opens the create page from the toolbar", async () => {
    const { router, user } = renderApp({ path: "/custom-fields" });

    await user.click(await screen.findByRole("button", { name: "New custom field" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/custom-fields/new"));
  });

  it("previews a selected definition with a full-page link, fetching it only once selected", async () => {
    const requests = recordApiRequests();
    const { router, user } = renderApp({ path: "/custom-fields" });

    await user.click(await screen.findByText(DEPLOYMENT_TIER.name));

    const dialog = await screen.findByRole("dialog", { name: "Custom field details" });
    expect((await within(dialog).findAllByText(DEPLOYMENT_TIER.key)).length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("link", { name: /open full page/i })).toHaveAttribute(
      "href",
      `/custom-fields/${DEPLOYMENT_TIER.id}`,
    );
    expect(router.state.location.search).toMatchObject({ selected: DEPLOYMENT_TIER.id });
    expect(
      requests.filter((request) => request.startsWith("GET /api/assets/custom-fields/")),
    ).toEqual([`GET /api/assets/custom-fields/${DEPLOYMENT_TIER.id}`]);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("selected"));
  });

  it("keeps a preview failure inside the dialog", async () => {
    mockApiError("get", "/assets/custom-fields/:id", 500, "Custom field request failed");
    renderApp({ path: `/custom-fields?selected=${PRIORITY.id}` });

    const dialog = await screen.findByRole("dialog", { name: "Custom field details" });
    expect(await within(dialog).findByText("Custom field request failed")).toBeVisible();
    expect(screen.getByText(CATEGORY.name)).toBeInTheDocument();
  });

  it("deletes confirmed definitions", async () => {
    const { user } = renderApp({ path: "/custom-fields" });

    for (const field of [CATEGORY, PRIORITY]) {
      const row = (await screen.findByText(field.name)).closest("tr")!;
      await user.click(within(row).getByRole("checkbox", { name: "Select row" }));
    }
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.customFields.get(CATEGORY.id)).toBeUndefined());
    expect(db.customFields.get(PRIORITY.id)).toBeUndefined();
    expect(db.customFields.get(DEPLOYMENT_TIER.id)).toBeDefined();
    expect((await screen.findAllByText(/^Deleted 2/)).length).toBeGreaterThan(0);
  });
});

describe("custom field detail", () => {
  it("shows the definition and opens the edit page", async () => {
    const { router, user } = renderApp({ path: `/custom-fields/${PRIORITY.id}` });

    expect(await screen.findByRole("heading", { level: 1, name: PRIORITY.name })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit custom field" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/custom-fields/${PRIORITY.id}/edit`),
    );
  });

  it("goes back to the list with its filters but without a selection", async () => {
    const { router, user } = renderApp({
      path: `/custom-fields/${PRIORITY.id}?filter=pri&selected=${PRIORITY.id}`,
    });

    await user.click(await screen.findByRole("link", { name: "Back to custom fields" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/custom-fields"));
    expect(router.state.location.search).toEqual({ filter: "pri" });
  });
});

describe("creating and editing definitions", () => {
  it("creates a trimmed definition and opens it", async () => {
    const { router, user } = renderApp({ path: "/custom-fields/new" });

    await fillTextField(user);
    await user.click(screen.getByRole("button", { name: "Create custom field" }));

    const created = await waitFor(() => {
      const field = db.customFields.all().find((candidate) => candidate.key === "risk_owner");
      expect(field).toMatchObject({
        name: "Risk Owner",
        type: AssetCustomFieldType.Text,
        required: true,
        defaultValue: "Security",
      });
      return field!;
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/custom-fields/${created.id}`),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Risk Owner" })).toBeVisible();
  });

  it("creates a select definition from edited option rows", async () => {
    const { user } = renderApp({ path: "/custom-fields/new" });

    await user.type(await screen.findByRole("textbox", { name: /^name$/i }), "Exposure");
    await user.type(screen.getByRole("textbox", { name: /^key$/i }), "exposure");
    await user.click(screen.getByLabelText("Type"));
    await user.click(await screen.findByRole("option", { name: "Select" }));

    await user.type(screen.getByLabelText("Option 1 value"), "internal");
    await user.type(screen.getByLabelText("Option 1 label"), "Internal");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option 2 value"), "restricted");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option 3 value"), "public");
    await user.type(screen.getByLabelText("Option 3 label"), "Public");
    await user.click(screen.getByRole("button", { name: "Remove option 2" }));
    expect(screen.getByLabelText("Option 2 value")).toHaveValue("public");

    await user.click(screen.getByLabelText("Default value"));
    await user.click(await screen.findByRole("option", { name: "Public" }));
    expect(screen.getByLabelText("Default value")).toHaveTextContent("Public");
    await user.click(screen.getByRole("button", { name: "Create custom field" }));

    await waitFor(() =>
      expect(db.customFields.all().find((field) => field.key === "exposure")).toMatchObject({
        type: AssetCustomFieldType.Select,
        defaultValue: "public",
        options: [
          { value: "internal", label: "Internal" },
          { value: "public", label: "Public" },
        ],
      }),
    );
    // Let the app finish opening the new definition before the test ends.
    expect(await screen.findByRole("heading", { level: 1, name: "Exposure" })).toBeVisible();
  });

  it("blocks incomplete select options until they're complete", async () => {
    const requests = recordApiRequests();
    const { user } = renderApp({ path: "/custom-fields/new" });

    await user.type(await screen.findByRole("textbox", { name: /^name$/i }), "Exposure");
    await user.type(screen.getByRole("textbox", { name: /^key$/i }), "exposure");
    await user.click(screen.getByLabelText("Type"));
    await user.click(await screen.findByRole("option", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: "Create custom field" }));
    expect(await screen.findByText("Add at least one option")).toBeVisible();

    await user.type(screen.getByLabelText("Option 1 value"), "internal");
    await user.click(screen.getByRole("button", { name: "Create custom field" }));
    expect(await screen.findByText("Enter an option label")).toBeVisible();
    expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);

    await user.type(screen.getByLabelText("Option 1 label"), "Internal");
    await user.click(screen.getByRole("button", { name: "Create custom field" }));
    await waitFor(() =>
      expect(db.customFields.all().find((field) => field.key === "exposure")).toMatchObject({
        options: [{ value: "internal", label: "Internal" }],
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Exposure" })).toBeVisible();
  });

  it("asks for a new default when the default option is removed", async () => {
    const { router, user } = renderApp({ path: `/custom-fields/${DEPLOYMENT_TIER.id}/edit` });

    expect(await screen.findByLabelText("Default value")).toHaveTextContent("Production");
    expect(screen.getByLabelText("Option 1 value")).toHaveValue("production");
    await user.click(screen.getByRole("button", { name: "Remove option 1" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Select a default from the available options")).toBeVisible();

    await user.click(screen.getByLabelText("Default value"));
    await user.click(await screen.findByRole("option", { name: "Staging" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(db.customFields.get(DEPLOYMENT_TIER.id)).toMatchObject({
        defaultValue: "staging",
        options: [{ value: "staging", label: "Staging" }],
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/custom-fields/${DEPLOYMENT_TIER.id}`),
    );
  });

  it("shows validation errors instead of submitting an empty form", async () => {
    const requests = recordApiRequests();
    const { user } = renderApp({ path: "/custom-fields/new" });

    await user.click(await screen.findByRole("button", { name: "Create custom field" }));

    expect(await screen.findByText("Enter a name")).toBeVisible();
    expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("stays on the form when creating fails", async () => {
    mockApiError("post", "/assets/custom-fields", 500, "Create failed");
    const { router, user } = renderApp({ path: "/custom-fields/new" });

    await fillTextField(user);
    await user.click(screen.getByRole("button", { name: "Create custom field" }));

    expect((await screen.findAllByText(/Create failed/)).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe("/custom-fields/new");
    expect(screen.getByRole("button", { name: "Create custom field" })).toBeEnabled();
  });

  it("cancels creation back to the filtered list", async () => {
    const { router, user } = renderApp({
      path: `/custom-fields/new?filter=owner&type=text&selected=${CATEGORY.id}`,
    });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/custom-fields"));
    expect(router.state.location.search).toEqual({ filter: "owner", type: "text" });
  });

  it("edits a definition and returns to its detail page", async () => {
    const { router, user } = renderApp({ path: `/custom-fields/${CATEGORY.id}/edit` });

    const name = await screen.findByRole("textbox", { name: /^name$/i });
    expect(name).toHaveValue(CATEGORY.name);
    expect(screen.getByRole("textbox", { name: /^key$/i })).toHaveValue(CATEGORY.key);
    await user.clear(name);
    await user.type(name, "Business category");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(db.customFields.get(CATEGORY.id)?.name).toBe("Business category"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/custom-fields/${CATEGORY.id}`),
    );
  });

  it("stays on the form when saving fails, and cancels back to detail", async () => {
    mockApiError("put", "/assets/custom-fields/:id", 500, "Update failed");
    const { router, user } = renderApp({ path: `/custom-fields/${CATEGORY.id}/edit` });

    await user.type(await screen.findByRole("textbox", { name: /^name$/i }), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findAllByText(/Update failed/)).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe(`/custom-fields/${CATEGORY.id}/edit`);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/custom-fields/${CATEGORY.id}`),
    );
    expect(db.customFields.get(CATEGORY.id)).toEqual(CATEGORY);
  });
});
