import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ImportFindingsPage } from "@/features/findings/pages/import-findings-page.tsx";
import { renderWithAppProviders } from "@/test/harness.tsx";

function renderImportFindingsPage() {
  return renderWithAppProviders(<ImportFindingsPage />);
}

describe("ImportFindingsPage", () => {
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
    const file = new File(["{}"], "scan.json", {
      type: "application/json",
    });

    fireEvent.change(screen.getByLabelText(/select findings import file/i), {
      target: {
        files: [file],
      },
    });

    expect(screen.getByText("scan.json")).toBeTruthy();
    expect(screen.getByText(/2 B/)).toBeTruthy();
    expect(screen.getByText(/application\/json/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect(screen.queryByText("scan.json")).toBeNull();
    });
  });

  it.each([
    ["bytes.json", 1023, "", "1023 B"],
    ["kilobyte.json", 1024, "application/json", "1.0 KB"],
    ["megabyte.json", 1024 * 1024, "", "1.0 MB"],
  ])("formats %s at the correct file-size boundary", (name, size, mime, displaySize) => {
    renderImportFindingsPage();
    const file = new File([new Uint8Array(size)], name, { type: mime });

    fireEvent.change(screen.getByLabelText(/select findings import file/i), {
      target: { files: [file] },
    });

    const metadata = screen.getByText(new RegExp(`^${displaySize.replace(".", "\\.")}`));
    expect(metadata).toBeVisible();
    expect(metadata).toHaveTextContent(displaySize);
    if (mime) {
      expect(metadata).toHaveTextContent(`${displaySize} • ${mime}`);
    } else {
      expect(metadata.textContent).toBe(displaySize);
    }
    expect(screen.getByRole("button", { name: /import findings unavailable/i })).toBeDisabled();
  });
});
