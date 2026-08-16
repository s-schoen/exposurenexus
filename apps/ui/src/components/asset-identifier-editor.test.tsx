import { AssetIdentifierType } from "@exposurenexus/types/model/asset";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetIdentifierEditor } from "@/components/asset-identifier-editor.tsx";

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
