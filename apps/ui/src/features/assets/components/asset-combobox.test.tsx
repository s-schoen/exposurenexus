import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetCombobox } from "@/features/assets/components/asset-combobox.tsx";
import { SEED_ASSETS } from "@/mocks/fixtures/index.ts";
import { renderWithAppProviders } from "@/test/harness.tsx";
import { holdApiResponses, seedScenario } from "@/test/msw.ts";

// Assets load from the MSW mock API (seeded with web-01, container-01 and api-worker).

const [WEB_01, CONTAINER_01] = SEED_ASSETS;

async function openCombobox(user: ReturnType<typeof renderWithAppProviders>["user"]) {
  const combobox = screen.getByRole("combobox", { name: /asset/i });
  await waitFor(() => expect(combobox).toBeEnabled());
  await user.click(combobox);
  return combobox;
}

describe("AssetCombobox", () => {
  it("disables the combobox while assets are loading", () => {
    holdApiResponses("get", "/assets");

    renderWithAppProviders(<AssetCombobox />);

    expect(screen.getByRole("combobox", { name: /asset/i })).toBeDisabled();
  });

  it("renders the empty state when no assets are available", async () => {
    seedScenario("empty");
    const { user } = renderWithAppProviders(<AssetCombobox />);

    await openCombobox(user);

    expect(await screen.findByText("No assets available")).toBeInTheDocument();
  });

  it("selects an asset, renders the selected label, and calls onChange", async () => {
    const onChange = vi.fn();
    const { user } = renderWithAppProviders(<AssetCombobox onChange={onChange} />);

    const combobox = await openCombobox(user);
    await user.click(await screen.findByRole("option", { name: new RegExp(WEB_01.displayName) }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(WEB_01));
    expect(combobox).toHaveTextContent(WEB_01.displayName);
  });

  it("filters assets by display name", async () => {
    const { user } = renderWithAppProviders(<AssetCombobox />);

    await openCombobox(user);
    await user.type(screen.getByPlaceholderText("Select asset..."), CONTAINER_01.displayName);

    expect(
      screen.getByRole("option", { name: new RegExp(CONTAINER_01.displayName) }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: new RegExp(WEB_01.displayName) }),
    ).not.toBeInTheDocument();
  });

  it("uses a field label as the combobox accessible name", () => {
    renderWithAppProviders(
      <div>
        <label htmlFor="assetId">Affected Asset</label>
        <AssetCombobox id="assetId" />
      </div>,
    );

    expect(screen.getByRole("combobox", { name: /affected asset/i })).toBeInTheDocument();
  });
});
