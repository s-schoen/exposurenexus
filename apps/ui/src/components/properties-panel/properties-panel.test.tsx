import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircleDot } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
} from "@/components/properties-panel/properties-panel.tsx";
import { PropertySelect } from "@/components/properties-panel/property-select.tsx";

const options = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
] as const;

type Status = (typeof options)[number]["value"];

// Holds the committed value the way a query cache would: it only changes when saving succeeds.
function StatusPanel({ onCommit }: { onCommit: (value: Status) => Promise<boolean> }) {
  const [value, setValue] = useState<Status>("open");

  return (
    <PropertiesPanel>
      <PropertyGroup>
        <PropertyRow icon={CircleDot} label="Status">
          <PropertySelect
            value={value}
            options={options}
            onCommit={async (next) => {
              const saved = await onCommit(next);
              if (saved) setValue(next);
              return saved;
            }}
          />
        </PropertyRow>
      </PropertyGroup>
    </PropertiesPanel>
  );
}

describe("PropertySelect", () => {
  it("is named by its row and commits a picked value at once", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => true);
    render(<StatusPanel onCommit={onCommit} />);

    const status = screen.getByRole("button", { name: "Status Open" });
    await user.click(status);
    await user.click(await screen.findByRole("option", { name: "Done" }));

    expect(onCommit).toHaveBeenCalledWith("done");
    await waitFor(() => expect(status).toHaveAccessibleName("Status Done"));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("filters the options by label", async () => {
    const user = userEvent.setup();
    render(<StatusPanel onCommit={async () => true} />);

    await user.click(screen.getByRole("button", { name: /^Status/ }));
    await user.type(await screen.findByRole("combobox"), "do");

    expect(screen.getByRole("option", { name: "Done" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Open" })).not.toBeInTheDocument();
  });

  it("commits nothing when cancelled or when the current value is picked", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => true);
    render(<StatusPanel onCommit={onCommit} />);
    const status = screen.getByRole("button", { name: /^Status/ });

    await user.click(status);
    await screen.findByRole("option", { name: "Done" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("option")).not.toBeInTheDocument());

    await user.click(status);
    await user.click(await screen.findByRole("option", { name: "Open" }));

    expect(onCommit).not.toHaveBeenCalled();
    expect(status).toHaveTextContent("Open");
  });

  it("shows the picked value while saving and reverts it when saving fails", async () => {
    const user = userEvent.setup();
    let finish: (saved: boolean) => void = () => {};
    const onCommit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    render(<StatusPanel onCommit={onCommit} />);
    const status = screen.getByRole("button", { name: /^Status/ });

    await user.click(status);
    await user.click(await screen.findByRole("option", { name: "Done" }));
    expect(status).toHaveTextContent("Done");
    expect(status).toHaveAttribute("aria-busy", "true");

    finish(false);

    await waitFor(() => expect(status).toHaveTextContent("Open"));
    expect(status).not.toHaveAttribute("aria-busy");
  });
});

describe("DetailSection", () => {
  it("shows its count and collapses its content", async () => {
    const user = userEvent.setup();
    render(
      <DetailSection title="Observations" count={2} action={<button type="button">Add</button>}>
        Reported by the scanner
      </DetailSection>,
    );

    const toggle = screen.getByRole("button", { name: "Observations 2" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Reported by the scanner")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Observations 2" })).toBeVisible();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Reported by the scanner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeVisible();
  });
});
