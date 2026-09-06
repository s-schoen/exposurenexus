import { AssetIdentifierType } from "@exposurenexus/contracts/model/asset";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssetIdentifierEditor,
  AssetIdentifierForm,
} from "@/features/assets/components/asset-identifier-editor.tsx";

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

  it("updates and removes the intended row without changing its sibling", () => {
    const onChange = vi.fn();
    const identifiers = [
      { type: AssetIdentifierType.DnsName, value: "api.example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: "private", value: "192.0.2.10" },
    ];
    render(<AssetIdentifierEditor value={identifiers} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Identifier value 1"), {
      target: { value: "web.example.com" },
    });

    expect(onChange).toHaveBeenLastCalledWith([
      { type: AssetIdentifierType.DnsName, namespace: undefined, value: "web.example.com" },
      { type: AssetIdentifierType.IpAddress, namespace: "private", value: "192.0.2.10" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove identifier 1" }));

    expect(onChange).toHaveBeenLastCalledWith([
      { type: AssetIdentifierType.IpAddress, namespace: "private", value: "192.0.2.10" },
    ]);
  });

  it("blocks submission of an invalid identifier", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <AssetIdentifierForm onSubmit={onSubmit} onCancel={onCancel} submitLabel="Save identifier" />,
    );

    fireEvent.change(screen.getByLabelText("Identifier value"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save identifier" }));

    expect(await screen.findByText(/must not contain a scheme/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
