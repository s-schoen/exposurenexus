import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { APIError } from "@/lib/api-client.ts";

import type { DetailQueryBoundaryState } from "@/components/detail-query-boundary.tsx";

function renderBoundary(query: DetailQueryBoundaryState<{ displayName: string }>) {
  render(
    <DetailQueryBoundary
      query={query}
      title="Asset details"
      errorTitle="Unable to load asset"
      errorDescription="The selected asset could not be loaded."
      missingMessage="This asset doesn't exist or was deleted."
    >
      {(asset) => <div>{asset.displayName}</div>}
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
        missingMessage="This asset doesn't exist or was deleted."
      >
        {(asset: { displayName: string }) => <div>{asset.displayName}</div>}
      </DetailQueryBoundary>,
    );

    expect(screen.getByText("Asset details")).toBeTruthy();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  });

  it("renders a readable query error when the primary detail query fails", () => {
    renderBoundary({
      data: undefined,
      error: new APIError(500, "Internal Server Error"),
      isPending: false,
    });

    expect(screen.getByText("Unable to load asset")).toBeTruthy();
    expect(screen.getByText("The server ran into a problem. Try again in a moment.")).toBeTruthy();
  });

  it("renders the missing message when the record doesn't exist", () => {
    renderBoundary({
      data: undefined,
      error: new APIError(404, "asset with id 1 does not exist"),
      isPending: false,
    });

    expect(screen.getByText("This asset doesn't exist or was deleted.")).toBeTruthy();
  });

  it("renders the missing message when the query has no data or error", () => {
    renderBoundary({
      data: undefined,
      error: null,
      isPending: false,
    });

    expect(screen.getByText("Unable to load asset")).toBeTruthy();
    expect(screen.getByText("This asset doesn't exist or was deleted.")).toBeTruthy();
  });

  it("passes non-null data to the success renderer", () => {
    renderBoundary({
      data: { displayName: "web-01" },
      error: null,
      isPending: false,
    });

    expect(screen.getByText("web-01")).toBeTruthy();
  });
});
