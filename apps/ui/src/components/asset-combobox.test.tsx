import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Asset, AssetType } from "@exposurenexus/types/model/asset";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
Element.prototype.scrollIntoView = () => undefined;

interface QueryState {
  data?: Array<Asset>;
  isLoading: boolean;
}

const mocks = vi.hoisted(() => {
  const assets: Array<Asset> = [
    {
      id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      name: "api-01",
      type: "host" as AssetType,
      ownerId: null,
    },
    {
      id: "0bb9b410-7763-4e7a-9942-b752367fd63d",
      name: "container-01",
      type: "container" as AssetType,
      ownerId: null,
    },
  ];
  const query: QueryState = {
    data: assets,
    isLoading: false,
  };

  return {
    assets,
    query,
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.query,
}));

vi.mock("@/api/asset.ts", () => ({
  createListAssetsQueryOptions: () => ({
    queryKey: ["assets"],
  }),
}));

beforeEach(() => {
  mocks.query = {
    data: mocks.assets,
    isLoading: false,
  };
});

afterEach(() => {
  cleanup();
});

describe("AssetCombobox", () => {
  it("disables the combobox while assets are loading", async () => {
    const { AssetCombobox } = await import("@/components/asset-combobox.tsx");
    mocks.query = {
      isLoading: true,
    };

    render(<AssetCombobox />);

    expect(screen.getByRole("combobox", { name: /asset/i })).toBeDisabled();
  });

  it("renders the empty state when no assets are available", async () => {
    const user = userEvent.setup();
    const { AssetCombobox } = await import("@/components/asset-combobox.tsx");
    mocks.query = {
      data: [],
      isLoading: false,
    };

    render(<AssetCombobox />);
    await user.click(screen.getByRole("combobox", { name: /asset/i }));

    expect(await screen.findByText("No assets available")).toBeInTheDocument();
  });

  it("selects an asset, renders the selected label, and calls onChange", async () => {
    const user = userEvent.setup();
    const { AssetCombobox } = await import("@/components/asset-combobox.tsx");
    const onChange = vi.fn();

    render(<AssetCombobox onChange={onChange} />);
    const combobox = screen.getByRole("combobox", { name: /asset/i });

    await user.click(combobox);
    await user.click(await screen.findByRole("option", { name: /api-01/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(mocks.assets[0]);
    });
    expect(combobox).toHaveTextContent("api-01");
  });

  it("uses a field label as the combobox accessible name", async () => {
    const { AssetCombobox } = await import("@/components/asset-combobox.tsx");

    render(
      <div>
        <label htmlFor="assetId">Affected Asset</label>
        <AssetCombobox id="assetId" />
      </div>,
    );

    expect(screen.getByRole("combobox", { name: /affected asset/i })).toBeInTheDocument();
  });
});
