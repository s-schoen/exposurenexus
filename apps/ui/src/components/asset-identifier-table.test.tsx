import { AssetIdentifierType } from "@exposurenexus/types/model/asset";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetIdentifierTable } from "@/components/asset-identifier-table.tsx";

import type { AssetIdentifierRecord } from "@exposurenexus/types/model/asset";

const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: confirmMock,
  },
}));

const identifier: AssetIdentifierRecord = {
  id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
  type: AssetIdentifierType.DnsName,
  namespace: null,
  value: "web-01.example.com",
};

afterEach(() => {
  cleanup();
  confirmMock.mockReset();
});

describe("AssetIdentifierTable", () => {
  it("renders identifiers in a compact embedded table", () => {
    render(
      <AssetIdentifierTable
        identifiers={[identifier]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Asset identifiers" })).toBeInTheDocument();
    expect(screen.getByText("DNS name")).toBeInTheDocument();
    expect(screen.getByText("Global")).toBeInTheDocument();
    expect(screen.getByText(identifier.value)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /search across visible columns/i })).toBeNull();
  });

  it("opens the add dialog and submits normalized values", async () => {
    const onAdd = vi.fn().mockResolvedValue({
      ...identifier,
      value: "new.example.com",
    });
    render(
      <AssetIdentifierTable identifiers={[]} onAdd={onAdd} onUpdate={vi.fn()} onRemove={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add identifier" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Identifier value" }), {
      target: { value: "NEW.Example.com." },
    });
    const addButtons = screen.getAllByRole("button", { name: "Add identifier" });
    fireEvent.click(addButtons[addButtons.length - 1]);

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        type: AssetIdentifierType.DnsName,
        namespace: undefined,
        value: "new.example.com",
      }),
    );
    expect(screen.queryByRole("heading", { name: "Add asset identifier" })).toBeNull();
  });

  it("edits identifiers through a dialog and preserves the identifier id", async () => {
    const onUpdate = vi.fn().mockResolvedValue({
      ...identifier,
      value: "internal.example.com",
    });
    render(
      <AssetIdentifierTable
        identifiers={[identifier]}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Edit identifier DNS name web-01\.example\.com/i }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Identifier value" }), {
      target: { value: "internal.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(identifier.id, {
        type: AssetIdentifierType.DnsName,
        namespace: undefined,
        value: "internal.example.com",
      }),
    );
  });

  it("keeps the add dialog open when the lifecycle rejects the mutation", async () => {
    const onAdd = vi.fn().mockResolvedValue(null);
    render(
      <AssetIdentifierTable identifiers={[]} onAdd={onAdd} onUpdate={vi.fn()} onRemove={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add identifier" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Identifier value" }), {
      target: { value: "new.example.com" },
    });
    const addButtons = screen.getAllByRole("button", { name: "Add identifier" });
    fireEvent.click(addButtons[addButtons.length - 1]);

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Add asset identifier" })).toBeInTheDocument();
  });

  it("confirms identifier deletion before calling the lifecycle action", async () => {
    confirmMock.mockResolvedValueOnce(true);
    const onRemove = vi.fn().mockResolvedValue(identifier);
    render(
      <AssetIdentifierTable
        identifiers={[identifier]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Delete identifier DNS name web-01\.example\.com/i }),
    );

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(identifier.id));
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Delete identifier",
        confirmVariant: "destructive",
      }),
    );
  });
});
