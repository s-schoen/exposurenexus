import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SEED_FINDINGS, SEED_OBSERVATIONS } from "@/mocks/fixtures/index.ts";
import { db, mockApiError } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

afterEach(cleanup);

// Observation flows on the finding detail page, against the MSW mock API.

const [ADMIN_ENDPOINT, OUTDATED_DEPENDENCY] = SEED_FINDINGS;
const [MANUAL_REPORT, SCANNER_REPORT] = SEED_OBSERVATIONS;

const observationsOf = (findingId: string) =>
  db.observations.all().filter((observation) => observation.findingId === findingId);

describe("finding observations", () => {
  it("lists the finding's observations", async () => {
    renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    expect(await screen.findByText(MANUAL_REPORT.title)).toBeVisible();
    // The scanner report shares the finding's title, so look for its own actions.
    expect(
      screen.getByRole("button", { name: `Move observation ${SCANNER_REPORT.title}` }),
    ).toBeVisible();
  });

  it("adds a manual observation", async () => {
    const { user } = renderApp({ path: `/findings/${OUTDATED_DEPENDENCY.id}` });

    await user.click(await screen.findByRole("button", { name: "Add observation" }));
    const dialog = await screen.findByRole("dialog", { name: "Add manual observation" });
    await user.type(within(dialog).getByLabelText("Title"), "Reproduced in staging");
    await user.click(within(dialog).getByRole("button", { name: "Add observation" }));

    await waitFor(() =>
      expect(
        observationsOf(OUTDATED_DEPENDENCY.id).map((observation) => observation.title),
      ).toContain("Reproduced in staging"),
    );
    expect(await screen.findByText("Reproduced in staging")).toBeVisible();
  });

  it("keeps the add dialog open when adding fails", async () => {
    mockApiError("post", "/findings/:id/observations", 500, "Add failed");
    const { user } = renderApp({ path: `/findings/${OUTDATED_DEPENDENCY.id}` });

    await user.click(await screen.findByRole("button", { name: "Add observation" }));
    const dialog = await screen.findByRole("dialog", { name: "Add manual observation" });
    await user.type(within(dialog).getByLabelText("Title"), "Reproduced in staging");
    await user.click(within(dialog).getByRole("button", { name: "Add observation" }));

    expect((await screen.findAllByText(/Add failed/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("dialog", { name: "Add manual observation" })).toBeVisible();
    expect(observationsOf(OUTDATED_DEPENDENCY.id)).toHaveLength(1);
  });

  it("corrects an observation", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(
      await screen.findByRole("button", { name: `Edit observation ${MANUAL_REPORT.title}` }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Correct observation" });
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Admin panel reachable publicly");
    await user.click(within(dialog).getByRole("button", { name: "Save correction" }));

    await waitFor(() =>
      expect(db.observations.get(MANUAL_REPORT.id)?.title).toBe("Admin panel reachable publicly"),
    );
  });

  it("moves an observation to another finding", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });

    await user.click(
      await screen.findByRole("button", { name: `Move observation ${SCANNER_REPORT.title}` }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Move observation" });
    const target = within(dialog).getByLabelText("Target finding");
    await waitFor(() => expect(target).not.toHaveAttribute("data-disabled"));
    await user.click(target);
    await user.click(await screen.findByRole("option", { name: OUTDATED_DEPENDENCY.title }));
    await user.click(within(dialog).getByRole("button", { name: "Move observation" }));

    await waitFor(() =>
      expect(db.observations.get(SCANNER_REPORT.id)?.findingId).toBe(OUTDATED_DEPENDENCY.id),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: `Move observation ${SCANNER_REPORT.title}` }),
      ).not.toBeInTheDocument(),
    );
  });

  it("deletes an observation only after confirmation", async () => {
    const { user } = renderApp({ path: `/findings/${ADMIN_ENDPOINT.id}` });
    const deleteButton = await screen.findByRole("button", {
      name: `Delete observation ${MANUAL_REPORT.title}`,
    });

    await user.click(deleteButton);
    await user.click(await screen.findByRole("button", { name: "Keep observation" }));
    expect(db.observations.get(MANUAL_REPORT.id)).toBeDefined();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `Delete observation ${MANUAL_REPORT.title}` }),
      ).toBeVisible(),
    );
    await user.click(
      screen.getByRole("button", { name: `Delete observation ${MANUAL_REPORT.title}` }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete observation" }));

    await waitFor(() => expect(db.observations.get(MANUAL_REPORT.id)).toBeUndefined());
  });
});
