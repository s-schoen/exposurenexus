import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportFindingsPage } from "@/features/findings/pages/import-findings-page.tsx";

const mocks = vi.hoisted(() => ({
  usePageMeta: vi.fn(),
}));

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

function renderImportFindingsPage() {
  return render(<ImportFindingsPage />);
}

describe("ImportFindingsPage", () => {
  beforeEach(() => mocks.usePageMeta.mockReset());

  afterEach(() => {
    cleanup();
  });

  it("communicates that automated imports are unavailable and cannot submit", () => {
    renderImportFindingsPage();

    expect(screen.getByText("Automated imports are work in progress")).toBeTruthy();
    expect(
      screen.getByText(
        "Importing scan results is temporarily unavailable while observation-based finding matching is being implemented.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /import findings unavailable/i })).toBeDisabled();
  });

  it("shows selected file metadata and clears the file", async () => {
    renderImportFindingsPage();
    const file = new File(["{}"], "nuclei.json", {
      type: "application/json",
    });

    fireEvent.change(screen.getByLabelText(/select findings import file/i), {
      target: {
        files: [file],
      },
    });

    expect(screen.getByText("nuclei.json")).toBeTruthy();
    expect(screen.getByText(/2 B/)).toBeTruthy();
    expect(screen.getByText(/application\/json/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect(screen.queryByText("nuclei.json")).toBeNull();
    });
  });
});
