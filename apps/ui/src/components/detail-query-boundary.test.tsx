import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";

import type { DetailQueryBoundaryState } from "@/components/detail-query-boundary.tsx";

afterEach(() => {
  cleanup();
});

function renderBoundary(query: DetailQueryBoundaryState<{ name: string }>) {
  render(
    <DetailQueryBoundary
      query={query}
      title="Asset details"
      errorTitle="Unable to load asset"
      errorDescription="The selected asset could not be loaded."
      missingMessage="The API did not return an asset record."
    >
      {(asset) => <div>{asset.name}</div>}
    </DetailQueryBoundary>,
  );
}

describe("DetailQueryBoundary", () => {
  it("renders the standard loading placeholder while pending", () => {
    const { container } = render(
      <DetailQueryBoundary
        query={{ data: undefined, error: null, isPending: true }}
        title="Asset details"
        errorTitle="Unable to load asset"
        errorDescription="The selected asset could not be loaded."
        missingMessage="The API did not return an asset record."
      >
        {(asset: { name: string }) => <div>{asset.name}</div>}
      </DetailQueryBoundary>,
    );

    expect(screen.getByText("Asset details")).toBeTruthy();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  });

  it("renders the query error when the primary detail query fails", () => {
    renderBoundary({
      data: undefined,
      error: new Error("Asset request failed"),
      isPending: false,
    });

    expect(screen.getByText("Unable to load asset")).toBeTruthy();
    expect(screen.getByText("Asset request failed")).toBeTruthy();
  });

  it("renders the missing message when the query has no data or error", () => {
    renderBoundary({
      data: undefined,
      error: null,
      isPending: false,
    });

    expect(screen.getByText("Unable to load asset")).toBeTruthy();
    expect(screen.getByText("The API did not return an asset record.")).toBeTruthy();
  });

  it("passes non-null data to the success renderer", () => {
    renderBoundary({
      data: { name: "web-01" },
      error: null,
      isPending: false,
    });

    expect(screen.getByText("web-01")).toBeTruthy();
  });
});
