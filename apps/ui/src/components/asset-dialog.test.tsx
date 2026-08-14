import { AssetType } from "@exposurenexus/types/model/asset";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetDialog } from "@/components/asset-dialog.tsx";

import type { ReactNode } from "react";

const queryMocks = vi.hoisted(() => ({
  ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
  users: [
    {
      id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
      username: "owner",
      displayName: "Asset Owner",
      email: "owner@example.com",
      enabled: false,
      roleIds: [],
    },
  ],
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  queryOptions: (options: unknown) => options,
  useQuery: () => ({
    data: queryMocks.users,
    isLoading: false,
    isPending: false,
  }),
}));

vi.mock("@/components/ui/select.tsx", () => ({
  Select: ({
    children,
    name,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    name?: string;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <select
      id={name}
      name={name}
      value={value ?? ""}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

afterEach(() => {
  cleanup();
});

function renderAssetDialog() {
  const call = {
    ended: false,
    end: vi.fn(),
  };

  const view = render(<AssetDialog call={call as never} />);

  return {
    ...view,
    call,
  };
}

describe("AssetDialog", () => {
  it("renders default values", () => {
    renderAssetDialog();

    const nameInput = screen.getByLabelText(/^name$/i);

    expect(nameInput).toBeInstanceOf(HTMLInputElement);
    expect(nameInput).toHaveValue("");
    expect(screen.getByLabelText(/^type$/i)).toHaveValue(AssetType.Host);
    expect(screen.getByLabelText(/^owner$/i)).toHaveValue("__no_owner__");
  });

  it("resolves null when cancelled", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(call.end).toHaveBeenCalledWith(null);
  });

  it("submits a valid host asset", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^name$/i), "api-01");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(call.end).toHaveBeenCalledWith({
        id: "",
        name: "api-01",
        type: AssetType.Host,
        ownerId: null,
      });
    });
  });

  it("submits once when the create button is clicked", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^name$/i), "api-01");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(call.end).toHaveBeenCalledWith({
        id: "",
        name: "api-01",
        type: AssetType.Host,
        ownerId: null,
      });
      expect(call.end).toHaveBeenCalledTimes(1);
    });
  });

  it("submits the selected asset type", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^name$/i), "container-01");
    await user.selectOptions(screen.getByLabelText(/^type$/i), AssetType.Container);
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(call.end).toHaveBeenCalledWith({
        id: "",
        name: "container-01",
        type: AssetType.Container,
        ownerId: null,
      });
    });
  });

  it("submits the selected owner", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^name$/i), "api-01");
    await user.selectOptions(screen.getByLabelText(/^owner$/i), queryMocks.ownerId);
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(call.end).toHaveBeenCalledWith({
        id: "",
        name: "api-01",
        type: AssetType.Host,
        ownerId: queryMocks.ownerId,
      });
    });
  });

  it("does not resolve when submitted without a name", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => {
      expect(call.end).not.toHaveBeenCalled();
    });
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
});
