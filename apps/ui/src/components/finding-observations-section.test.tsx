import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/components/finding-observations-section.stories.tsx";

const { AddManualObservation, DeleteFinalObservation, Empty, ErrorState, Loading, Populated } =
  composeStories(stories);

afterEach(cleanup);

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

  it("offers every resource variant and observation-only snapshot field", async () => {
    const actor = userEvent.setup();
    render(<AddManualObservation />);
    await actor.click(await screen.findByRole("button", { name: "Add observation" }));

    let dialog = screen.getByRole("dialog", { name: "Add manual observation" });
    expect(within(dialog).queryByLabelText("Source")).toBeNull();
    expect(within(dialog).queryByLabelText("Ingestion")).toBeNull();
    expect(within(dialog).queryByLabelText("Finding")).toBeNull();

    for (const [type, snapshotLabel] of [
      ["Web endpoint", "Reported URL"],
      ["Source code", "Revision"],
      ["Package", "Version"],
      ["Container image", "Tag"],
      ["Cloud resource", "Display name"],
    ] as const) {
      await actor.click(within(dialog).getByLabelText("Affected resource type"));
      await actor.click(screen.getByRole("option", { name: type }));
      expect(within(dialog).getByLabelText(snapshotLabel)).toBeVisible();
      await actor.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await actor.click(screen.getByRole("button", { name: "Add observation" }));
      dialog = screen.getByRole("dialog", { name: "Add manual observation" });
    }

    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    await actor.click(screen.getByRole("option", { name: "Network service" }));
    expect(within(dialog).getByLabelText("Protocol")).toBeVisible();
    await actor.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await actor.click(screen.getByRole("button", { name: "Add observation" }));
    dialog = screen.getByRole("dialog", { name: "Add manual observation" });
    await actor.click(within(dialog).getByLabelText("Affected resource type"));
    expect(screen.queryByRole("option", { name: "Asset" })).toBeNull();
    await actor.click(screen.getByRole("option", { name: "Unspecified resource" }));
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
    await actor.click(await screen.findByRole("option", { name: /Target finding/ }));
    await actor.click(within(dialog).getByRole("button", { name: "Move observation" }));

    await waitFor(() => expect(screen.queryByText("Unspecified resource")).toBeNull());
    expect(screen.queryByRole("dialog", { name: "Move observation" })).toBeNull();
  });
});
