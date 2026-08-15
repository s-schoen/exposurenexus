import { AssetIdentifierType } from "@exposurenexus/types/model/asset";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssetIdentifierEditor,
  AssetIdentifierManager,
} from "@/components/asset-identifier-editor.tsx";

afterEach(() => {
  cleanup();
});

describe("AssetIdentifierEditor", () => {
  it("shows an empty identifier state and adds a draft row", async () => {
    const onChange = vi.fn();
    render(<AssetIdentifierEditor value={[]} onChange={onChange} />);

    expect(screen.getByText(/no identifiers/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /add identifier/i }));

    expect(onChange).toHaveBeenCalledWith([
      { type: AssetIdentifierType.DnsName, namespace: undefined, value: "" },
    ]);
  });

  it("canonicalizes valid input on blur and reports invalid input immediately", () => {
    const onChange = vi.fn();
    const view = render(
      <AssetIdentifierEditor
        value={[{ type: AssetIdentifierType.DnsName, value: "API.Example.com." }]}
        onChange={onChange}
      />,
    );

    fireEvent.blur(screen.getByLabelText("Identifier value 1"));
    expect(onChange).toHaveBeenCalledWith([
      { type: AssetIdentifierType.DnsName, namespace: undefined, value: "api.example.com" },
    ]);

    view.rerender(
      <AssetIdentifierEditor
        value={[{ type: AssetIdentifierType.DnsName, value: "https://example.com" }]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/must not contain a scheme/i)).toBeTruthy();
  });
});

describe("AssetIdentifierManager", () => {
  it("adds, updates, and removes managed identifiers", async () => {
    const identifier = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    } as const;
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <AssetIdentifierManager
        identifiers={[identifier]}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    );

    fireEvent.change(screen.getByLabelText("Identifier value 1"), {
      target: { value: "api.internal.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update identifier/i }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        identifier.id,
        expect.objectContaining({
          value: "api.internal.example.com",
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /remove identifier 1/i }));
    expect(onRemove).toHaveBeenCalledWith(identifier.id);

    fireEvent.click(screen.getByRole("button", { name: /^add identifier$/i }));
    fireEvent.change(screen.getByLabelText("Identifier value 2"), {
      target: { value: "new.example.com" },
    });
    const addButtons = screen.getAllByRole("button", { name: /^add identifier$/i });
    fireEvent.click(addButtons[addButtons.length - 1]);
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          value: "new.example.com",
        }),
      ),
    );
  });

  it("keeps a draft when adding an identifier fails", async () => {
    const onAdd = vi.fn().mockResolvedValue(null);
    render(
      <AssetIdentifierManager
        identifiers={[]}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^add identifier$/i }));
    fireEvent.change(screen.getByLabelText("Identifier value 1"), {
      target: { value: "new.example.com" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^add identifier$/i }).at(-1)!);

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(screen.getByLabelText("Identifier value 1")).toBeTruthy();
  });
});
