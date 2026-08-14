import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Inplace } from "@/components/inplace.tsx";

import type { ReactNode } from "react";

const selectMocks = vi.hoisted(() => ({
  onValueChange: undefined as undefined | ((value: string) => void),
}));

vi.mock("@/components/ui/select.tsx", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: ReactNode;
    onValueChange?: (value: string) => void;
  }) => {
    selectMocks.onValueChange = onValueChange;

    return <div>{children}</div>;
  },
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <button type="button" onClick={() => selectMocks.onValueChange?.(value)}>
      {children}
    </button>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button" role="combobox">
      {children}
    </button>
  ),
}));

beforeEach(() => {
  selectMocks.onValueChange = undefined;
});

afterEach(() => {
  cleanup();
});

function editButton() {
  return screen.getAllByRole("button")[0];
}

function saveButton() {
  return screen.getAllByRole("button")[0];
}

function cancelButton() {
  return screen.getAllByRole("button")[1];
}

describe("Inplace", () => {
  it("renders display mode with a custom display element", () => {
    render(
      <Inplace
        value="api-01"
        onSave={vi.fn()}
        displayElement={(value) => <strong>Asset: {value}</strong>}
      />,
    );

    expect(screen.getByText("Asset: api-01")).toBeTruthy();
  });

  it("enters edit mode from the edit icon and saves input changes", async () => {
    const onSave = vi.fn();
    render(<Inplace value="api-01" onSave={onSave} />);

    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "api-02" },
    });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("api-02");
    });
    expect(screen.getByText("api-01")).toBeTruthy();
  });

  it("enters edit mode by clicking the display value", () => {
    render(<Inplace value="api-01" onSave={vi.fn()} editOnClick />);

    fireEvent.click(screen.getByText("api-01"));

    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("does not save unchanged values", async () => {
    const onSave = vi.fn();
    render(<Inplace value="api-01" onSave={onSave} />);

    fireEvent.click(editButton());
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByText("api-01")).toBeTruthy();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("commits input changes with Enter and cancels with Escape", async () => {
    const onSave = vi.fn();
    const { rerender } = render(<Inplace value="api-01" onSave={onSave} />);

    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "api-02" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("api-02");
    });

    rerender(<Inplace value="api-01" onSave={onSave} />);
    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "api-03" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(screen.getByText("api-01")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalledWith("api-03");
  });

  it("commits selected values", async () => {
    const onSave = vi.fn();
    render(
      <Inplace
        value="host"
        onSave={onSave}
        editElement={{
          type: "select",
          options: [
            { label: "Host", value: "host" },
            { label: "Container", value: "container" },
          ],
        }}
      />,
    );

    fireEvent.click(editButton());
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Container"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("container");
    });
  });

  it("commits and cancels custom edit elements", async () => {
    const onSave = vi.fn();
    const onEditingChange = vi.fn();
    render(
      <Inplace
        value="api-01"
        onSave={onSave}
        onEditingChange={onEditingChange}
        editElement={{
          type: "custom",
          render: ({ onCancel, onChange, onCommit, value }) => (
            <div>
              <span>Editing {value}</span>
              <button type="button" onClick={() => onChange("api-02")}>
                change custom
              </button>
              <button type="button" onClick={() => onCommit()}>
                save custom
              </button>
              <button type="button" onClick={() => onCancel()}>
                cancel custom
              </button>
            </div>
          ),
        }}
      />,
    );

    fireEvent.click(editButton());
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: /change custom/i }));
    fireEvent.click(screen.getByRole("button", { name: /save custom/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("api-02");
    });
    await waitFor(() => {
      expect(onEditingChange).toHaveBeenLastCalledWith(false);
    });

    fireEvent.click(editButton());
    fireEvent.click(screen.getByRole("button", { name: /cancel custom/i }));

    expect(screen.getByText("api-01")).toBeTruthy();
    await waitFor(() => {
      expect(onEditingChange).toHaveBeenLastCalledWith(false);
    });
  });

  it("hides the edit icon when requested", () => {
    render(<Inplace value="api-01" onSave={vi.fn()} showEditIcon={false} />);

    expect(editButton().className).toContain("opacity-0");
  });

  it("cancels input editing from the cancel button", () => {
    render(<Inplace value="api-01" onSave={vi.fn()} />);

    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "api-02" },
    });
    fireEvent.click(cancelButton());

    expect(screen.getByText("api-01")).toBeTruthy();
  });
});
