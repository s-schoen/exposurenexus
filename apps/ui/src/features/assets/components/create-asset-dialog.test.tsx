import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateAssetDialog } from "@/features/assets/components/create-asset-dialog.tsx";
import { SEED_USERS } from "@/mocks/fixtures/index.ts";
import { renderWithAppProviders } from "@/test/harness.tsx";
import { captureApiCalls, holdApiResponses, mockApiError } from "@/test/msw.ts";

import type { CapturedApiCall } from "@/test/msw.ts";
import type { ReactNode } from "react";

// Owners load from the MSW mock API; the seeded admin is the owner used below.
const OWNER = SEED_USERS[0];

const selectMocks = vi.hoisted(() => ({
  value: undefined as string | undefined,
}));

// jsdom cannot drive the Base UI select popup; a native <select> stands in for it.
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
  }) => {
    const [trigger, content] = Array.isArray(children) ? children : [children, null];
    selectMocks.value = value;

    return (
      <div>
        <select
          id={name}
          name={name}
          value={value ?? ""}
          onChange={(event) => onValueChange?.(event.target.value)}
        >
          {content}
        </select>
        {trigger}
      </div>
    );
  },
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
    <span data-testid={`${id}-trigger`}>{children}</span>
  ),
  SelectValue: ({ children, placeholder }: { children?: ReactNode; placeholder?: ReactNode }) => (
    <span>{children ?? selectMocks.value ?? placeholder}</span>
  ),
}));

beforeEach(() => {
  selectMocks.value = undefined;
});

function renderAssetDialog() {
  const posts = captureApiCalls("post", "/assets");
  const call = {
    ended: false,
    end: vi.fn(),
  };

  const view = renderWithAppProviders(<CreateAssetDialog call={call as never} />);

  return {
    ...view,
    call,
    posts,
  };
}

// Waits for the dialog to resolve to the created asset and returns the payload it sent.
async function createdPayload(
  call: { end: ReturnType<typeof vi.fn> },
  posts: Array<CapturedApiCall>,
) {
  await waitFor(() => {
    expect(call.end).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }));
  });
  expect(posts).toHaveLength(1);
  return posts[0].body;
}

describe("CreateAssetDialog", () => {
  it("renders default values", () => {
    renderAssetDialog();

    const nameInput = screen.getByLabelText(/^display name$/i);

    expect(nameInput).toBeInstanceOf(HTMLInputElement);
    expect(nameInput).toHaveValue("");
    expect(screen.getByLabelText(/^type$/i)).toHaveValue(AssetType.Host);
    expect(screen.getByLabelText(/^environment$/i)).toHaveValue(AssetEnvironment.Unknown);
    expect(screen.getByLabelText(/^lifecycle state$/i)).toHaveValue(AssetLifecycleState.Active);
    expect(screen.getByLabelText(/^owner$/i)).toHaveValue("__no_owner__");
    expect(screen.getByTestId("ownerId-trigger")).toHaveTextContent("No owner");
  });

  it("resolves null when cancelled", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(call.end).toHaveBeenCalledWith(null);
  });

  it("resolves null when the close control is clicked", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(call.end).toHaveBeenCalledWith(null);
  });

  it("submits a valid host asset", async () => {
    const user = userEvent.setup();
    const { call, posts } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^display name$/i), "api-01");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await createdPayload(call, posts)).toEqual({
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
    });
  });

  it("submits once when the create button is clicked", async () => {
    const user = userEvent.setup();
    const { call, posts } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^display name$/i), "api-01");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await createdPayload(call, posts)).toEqual({
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
    });
    expect(call.end).toHaveBeenCalledTimes(1);
  });

  it("submits the selected asset type", async () => {
    const user = userEvent.setup();
    const { call, posts } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^display name$/i), "container-01");
    await user.selectOptions(screen.getByLabelText(/^type$/i), AssetType.ContainerImage);
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await createdPayload(call, posts)).toEqual({
      displayName: "container-01",
      type: AssetType.ContainerImage,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
    });
  });

  it("renders selected labels instead of select keys", async () => {
    const user = userEvent.setup();
    renderAssetDialog();

    await user.selectOptions(screen.getByLabelText(/^type$/i), AssetType.ContainerImage);
    await user.selectOptions(
      screen.getByLabelText(/^environment$/i),
      AssetEnvironment.NotApplicable,
    );
    await user.selectOptions(
      screen.getByLabelText(/^lifecycle state$/i),
      AssetLifecycleState.Archived,
    );
    await screen.findByRole("option", { name: OWNER.displayName });
    await user.selectOptions(screen.getByLabelText(/^owner$/i), OWNER.id);

    expect(screen.getByTestId("type-trigger")).toHaveTextContent("ContainerImage");
    expect(screen.getByTestId("environment-trigger")).toHaveTextContent("NotApplicable");
    expect(screen.getByTestId("lifecycleState-trigger")).toHaveTextContent("Archived");
    expect(screen.getByTestId("ownerId-trigger")).toHaveTextContent(OWNER.displayName);
  });

  it("submits the selected owner", async () => {
    const user = userEvent.setup();
    const { call, posts } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^display name$/i), "api-01");
    await screen.findByRole("option", { name: OWNER.displayName });
    await user.selectOptions(screen.getByLabelText(/^owner$/i), OWNER.id);
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await createdPayload(call, posts)).toEqual({
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: OWNER.id,
    });
  });

  it("resolves ownerId to null after clearing a selected owner", async () => {
    const user = userEvent.setup();
    const { call, posts } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^display name$/i), "api-01");
    await screen.findByRole("option", { name: OWNER.displayName });
    await user.selectOptions(screen.getByLabelText(/^owner$/i), OWNER.id);
    await user.selectOptions(screen.getByLabelText(/^owner$/i), "__no_owner__");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await createdPayload(call, posts)).toEqual({
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
    });
  });

  it.each([
    ["delayed", () => holdApiResponses("get", "/users")],
    ["failed", () => mockApiError("get", "/users", 500)],
  ])("keeps the form usable without stale owners when users are %s", async (_state, setup) => {
    const user = userEvent.setup();
    setup();
    const { call, posts } = renderAssetDialog();

    expect(screen.queryByRole("option", { name: OWNER.displayName })).toBeNull();
    await user.type(screen.getByLabelText(/^display name$/i), "api-01");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await createdPayload(call, posts)).toEqual({
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
    });
  });

  it("submits the selected environment and lifecycle state", async () => {
    const user = userEvent.setup();
    const { call, posts } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^display name$/i), "api-01");
    await user.selectOptions(
      screen.getByLabelText(/^environment$/i),
      AssetEnvironment.NotApplicable,
    );
    await user.selectOptions(
      screen.getByLabelText(/^lifecycle state$/i),
      AssetLifecycleState.Archived,
    );
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await createdPayload(call, posts)).toEqual({
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.NotApplicable,
      lifecycleState: AssetLifecycleState.Archived,
      ownerId: null,
    });
  });

  it("submits identifiers entered in the asset form", async () => {
    const user = userEvent.setup();
    const { call, posts } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^display name$/i), "api-01");
    await user.click(screen.getByRole("button", { name: /add identifier/i }));
    await user.type(screen.getByLabelText("Identifier value 1"), "API.Example.com.");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await createdPayload(call, posts)).toEqual({
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [
        {
          type: AssetIdentifierType.DnsName,
          value: "api.example.com",
        },
      ],
    });
  });

  it("stays open with the draft when the API rejects the create", async () => {
    mockApiError("post", "/assets", 500, "Create failed");
    const user = userEvent.setup();
    const { call, posts } = renderAssetDialog();

    await user.type(screen.getByLabelText(/^display name$/i), "api-01");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(posts).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /^create$/i })).toBeEnabled());
    expect(call.end).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^display name$/i)).toHaveValue("api-01");
  });

  it("does not resolve when submitted without a display name", async () => {
    const user = userEvent.setup();
    const { call } = renderAssetDialog();

    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => {
      expect(call.end).not.toHaveBeenCalled();
    });
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });
});
