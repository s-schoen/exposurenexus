import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { composeStories } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as stories from "@/features/assets/components/asset-detail-content.stories";
import {
  AssetDetailContent,
  createAssetCustomFieldValuePayload,
  getAssetCustomFieldDraftValue,
} from "@/features/assets/components/asset-detail-content.tsx";
import { formatAssetCustomFieldValue } from "@/features/assets/lib/asset-custom-fields.ts";
import { createAssetByIDQueryOptions } from "@/features/assets/queries/assets.ts";
import { STORY_USERS } from "@/test/fixtures.ts";

import type { Asset } from "@exposurenexus/contracts/model/asset";
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
} from "@exposurenexus/contracts/model/asset-custom-field";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

const mocks = vi.hoisted(() => ({
  toastActionError: vi.fn(),
}));

vi.mock("@/lib/action-error-toast.ts", () => ({
  toastActionError: mocks.toastActionError,
}));

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
Element.prototype.scrollIntoView = () => undefined;

const {
  CustomFieldsError,
  EmptyCustomFields,
  ErrorState,
  LoadingCustomFields,
  OwnerUpdateError,
  WithCustomFields,
} = composeStories(stories);

beforeEach(() => {
  mocks.toastActionError.mockReset();
});

const fetchRestorers: Array<() => void> = [];

afterEach(() => {
  while (fetchRestorers.length > 0) {
    fetchRestorers.pop()?.();
  }
  cleanup();
});

const selectValue: AssetCustomFieldValue = {
  fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
  key: "deployment_tier",
  name: "Deployment tier",
  source: AssetCustomFieldValueSource.Asset,
  type: AssetCustomFieldType.Select,
  value: "production",
  options: [
    {
      id: "6b567696-6808-45be-ab67-a8683d98a138",
      fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
      value: "production",
      label: "Production",
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

interface CapturedRequest {
  path: string;
  method: string;
  body?: unknown;
}

function getRequestPath(input: RequestInfo | URL): string {
  const url = input instanceof Request ? input.url : String(input);
  return new URL(url, window.location.origin).pathname;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function getRequestBody(init?: RequestInit): unknown {
  return typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
}

function captureFetchRequests(): Array<CapturedRequest> {
  const requests: Array<CapturedRequest> = [];
  const originalFetch = globalThis.fetch;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const method = getRequestMethod(input, init);
    requests.push({
      path: getRequestPath(input),
      method,
      body: getRequestBody(init),
    });
    return originalFetch(input, init);
  });

  fetchRestorers.push(() => fetchSpy.mockRestore());
  return requests;
}

async function waitForRequest(
  requests: Array<CapturedRequest>,
  path: string,
  method: string,
): Promise<CapturedRequest> {
  let request: CapturedRequest | undefined;

  await waitFor(() => {
    request = requests.find((candidate) => candidate.path === path && candidate.method === method);
    expect(request).toBeDefined();
  });

  if (!request) {
    throw new Error(`Expected ${method} ${path} request`);
  }

  return request;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assetCustomFieldValuesResponse(values: Array<AssetCustomFieldValue>) {
  return jsonResponse({ data: { items: values } });
}

function assetCustomFieldDefinitionsResponse(definitions: Array<AssetCustomFieldDefinition>) {
  return jsonResponse({ data: { items: definitions } });
}

function assetResponse(asset: Asset) {
  return jsonResponse({ data: asset });
}

interface LocalAssetDetailHarnessOptions {
  users?: Array<UserProfile> | "pending" | "error";
  availableCustomFields?: Array<AssetCustomFieldDefinition> | "pending" | "error";
  ownerUpdates?: Array<"error" | "success">;
}

function renderWithLocalAssetDetailHarness({
  users = STORY_USERS,
  availableCustomFields = [],
  ownerUpdates = [],
}: LocalAssetDetailHarnessOptions = {}) {
  const asset = WithCustomFields.args.asset as Asset;
  const customFields = WithCustomFields.args.customFields as Array<AssetCustomFieldValue>;
  const assetRef = { current: asset };
  const customFieldsRef = { current: customFields };
  const availableFieldsRef = {
    current: Array.isArray(availableCustomFields) ? availableCustomFields : [],
  };
  const usersDeferred = deferred<Response>();
  const availableFieldsDeferred = deferred<Response>();
  const requests: Array<CapturedRequest> = [];
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
      },
    },
  });

  queryClient.setQueryData(createAssetByIDQueryOptions(asset.id).queryKey, asset);
  queryClient.setQueryData(["assets", asset.id, "custom-fields"], customFields);
  if (Array.isArray(users)) {
    queryClient.setQueryData(["users"], users);
  }
  if (Array.isArray(availableCustomFields)) {
    queryClient.setQueryData(
      ["assets", asset.id, "custom-fields", "available"],
      availableFieldsRef.current,
    );
  }

  const originalFetch = globalThis.fetch;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = getRequestPath(input);
    const method = getRequestMethod(input, init);
    const body = getRequestBody(init);
    requests.push({ path, method, body });

    if (path === "/api/users" && method === "GET") {
      if (users === "pending") {
        return await usersDeferred.promise;
      }
      if (users === "error") {
        return jsonResponse({ error: "Users failed" }, 500);
      }
      return jsonResponse({ data: { items: users } });
    }

    if (path === `/api/assets/${asset.id}` && method === "GET") {
      return assetResponse(assetRef.current);
    }

    if (path === `/api/assets/${asset.id}` && method === "PATCH") {
      const outcome = ownerUpdates.shift() ?? "success";
      if (outcome === "error") {
        return jsonResponse({ error: "Owner update failed" }, 400);
      }

      assetRef.current = {
        ...assetRef.current,
        ...(body as Partial<Asset>),
      };
      queryClient.setQueryData(createAssetByIDQueryOptions(asset.id).queryKey, assetRef.current);
      return assetResponse(assetRef.current);
    }

    if (path === `/api/assets/${asset.id}/custom-fields` && method === "GET") {
      return assetCustomFieldValuesResponse(customFieldsRef.current);
    }

    if (path === `/api/assets/${asset.id}/custom-fields/available` && method === "GET") {
      if (availableCustomFields === "pending") {
        return await availableFieldsDeferred.promise;
      }
      if (availableCustomFields === "error") {
        return jsonResponse({ error: "Available custom fields failed" }, 500);
      }
      return assetCustomFieldDefinitionsResponse(availableFieldsRef.current);
    }

    return originalFetch(input, init);
  });

  fetchRestorers.push(() => fetchSpy.mockRestore());

  function AssetDetailPreview({ assetId }: { assetId: string }) {
    const assetQuery = useQuery(createAssetByIDQueryOptions(assetId));

    return assetQuery.data ? <AssetDetailContent asset={assetQuery.data} /> : null;
  }

  const view = render(
    <QueryClientProvider client={queryClient}>
      <AssetDetailPreview assetId={asset.id} />
    </QueryClientProvider>,
  );

  return {
    ...view,
    asset,
    availableFieldsDeferred,
    queryClient,
    requests,
    usersDeferred,
  };
}

describe("asset detail custom field helpers", () => {
  it("formats select values with their option label", () => {
    expect(formatAssetCustomFieldValue(selectValue)).toBe("Production");
  });

  it("formats empty values and source labels", () => {
    const emptyValue: AssetCustomFieldValue = {
      fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
      key: "category",
      name: "Category",
      source: AssetCustomFieldValueSource.Empty,
      type: AssetCustomFieldType.Text,
      value: null,
    };

    expect(formatAssetCustomFieldValue(emptyValue)).toBe("None");
    expect(getAssetCustomFieldDraftValue(emptyValue)).toBe("");
  });

  it("normalizes number edits for the asset value update payload", () => {
    const numberValue: AssetCustomFieldValue = {
      fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
      key: "priority",
      name: "Priority",
      source: AssetCustomFieldValueSource.Default,
      type: AssetCustomFieldType.Number,
      value: 3,
    };

    expect(createAssetCustomFieldValuePayload(numberValue, "4")).toBe(4);
    expect(createAssetCustomFieldValuePayload(numberValue, "")).toBeNull();
  });
});

describe("AssetDetailContent stories", () => {
  it("renders custom fields in the asset sidebar", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0);
      expect(screen.getByRole("heading", { name: "Asset identifiers" })).toBeInTheDocument();
      expect(screen.getByText("web-01.example.com")).toBeInTheDocument();
      expect(screen.getAllByText("Custom fields").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Category").length).toBeGreaterThan(0);
      expect(screen.getByText("Internet-facing")).toBeTruthy();
      expect(screen.getAllByText("Priority").length).toBeGreaterThan(0);
      expect(screen.getByText("3")).toBeTruthy();
      expect(screen.getAllByText("Deployment tier").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Production").length).toBeGreaterThan(0);
      expect(screen.getByText("None")).toBeTruthy();
    });
  });

  it("edits each core asset field from the detail sidebar", async () => {
    const user = userEvent.setup();
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getAllByText("web-01").length).toBeGreaterThan(0);
    });

    const metadataRow = (label: string) => {
      const labelElement = screen.getByText(label, { selector: "span" });
      const row = labelElement.parentElement?.parentElement;
      if (!row) {
        throw new Error(`Expected metadata row for ${label}`);
      }
      return within(row);
    };

    const displayNameRow = metadataRow("Display name");
    await user.click(displayNameRow.getByRole("button", { name: "web-01" }));
    const displayNameInput = displayNameRow.getByRole("textbox", { name: "Edit value" });
    fireEvent.change(displayNameInput, { target: { value: "api-01" } });
    await user.click(displayNameRow.getByRole("button", { name: "Save edit" }));

    await waitFor(() => expect(screen.getAllByText("api-01").length).toBeGreaterThan(0));

    const typeRow = metadataRow("Type");
    await user.click(typeRow.getByRole("button", { name: "Host" }));
    await user.click(screen.getByRole("option", { name: "Container Image" }));
    await waitFor(() =>
      expect(metadataRow("Type").getByText("Container Image")).toBeInTheDocument(),
    );

    const environmentRow = metadataRow("Environment");
    await user.click(environmentRow.getByRole("button", { name: "Production" }));
    await user.click(screen.getByRole("option", { name: "Staging" }));
    await waitFor(() =>
      expect(metadataRow("Environment").getByText("Staging")).toBeInTheDocument(),
    );

    const lifecycleRow = metadataRow("Lifecycle state");
    await user.click(lifecycleRow.getByRole("button", { name: "Active" }));
    await user.click(screen.getByRole("option", { name: "Archived" }));
    await waitFor(() =>
      expect(metadataRow("Lifecycle state").getByText("Archived")).toBeInTheDocument(),
    );
  });

  it("renders no-owner and unknown owner states", async () => {
    const noOwnerAsset = {
      id: "4b4f4dc9-77d5-4bb5-90a4-0d764a5fbf4b",
      displayName: "web-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: "f74d7ff2-2f45-4bb8-9f16-659d633cb398",
      updatedBy: "bb9f2b64-2f45-4bb8-9f16-659d633cb398",
    };
    const unknownOwnerAsset = {
      ...noOwnerAsset,
      ownerId: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
    };

    const noOwner = render(<WithCustomFields asset={noOwnerAsset} />);

    await waitFor(() => {
      expect(screen.getAllByText("No Owner").length).toBeGreaterThan(0);
    });

    noOwner.unmount();

    render(<WithCustomFields asset={unknownOwnerAsset} />);

    await waitFor(() => {
      expect(screen.getAllByText("Unknown Owner").length).toBeGreaterThan(0);
    });
  });

  it("renders asset owners as user labels until owner editing starts", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("button", { name: "Asset owner" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit asset owner" })).toBeNull();

    const ownerButtons = screen.getAllByRole("button", { name: "Robin Owner" });
    fireEvent.click(ownerButtons[ownerButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Asset owner" })).toBeTruthy();
    });
  });

  it("does not mutate when an owner edit is cancelled", async () => {
    const user = userEvent.setup();
    render(<WithCustomFields />);

    await waitFor(() => expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0));
    const requests = captureFetchRequests();
    const ownerButtons = screen.getAllByRole("button", { name: "Robin Owner" });
    await user.click(ownerButtons[ownerButtons.length - 1]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Asset owner" })).toBeVisible());

    await user.click(screen.getByRole("button", { name: "Cancel asset owner edit" }));

    expect(
      requests.some(
        (request) =>
          request.path === `/api/assets/${WithCustomFields.args.asset!.id}` &&
          request.method === "PATCH",
      ),
    ).toBe(false);
  });

  it("keeps the owner picker disabled until delayed users arrive", async () => {
    const { usersDeferred } = renderWithLocalAssetDetailHarness({ users: "pending" });
    const ownerLabel = screen.getByText("Owner", { selector: "span" });
    const ownerRow = ownerLabel.parentElement;

    if (!ownerRow) {
      throw new Error("Expected the owner metadata row");
    }

    fireEvent.click(within(ownerRow).getAllByRole("button")[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Asset owner" })).toBeDisabled());

    usersDeferred.resolve(jsonResponse({ data: { items: STORY_USERS } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Asset owner" })).toBeEnabled());
  });

  it("shows the actual owner after a failed inline update is retried successfully", async () => {
    const user = userEvent.setup();
    const { requests } = renderWithLocalAssetDetailHarness({
      ownerUpdates: ["error", "success"],
    });

    await waitFor(() => expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0));
    const ownerLabel = screen.getByText("Owner", { selector: "span" });
    const ownerRow = ownerLabel.parentElement;

    if (!ownerRow) {
      throw new Error("Expected the owner metadata row");
    }

    const openOwnerPicker = () => {
      return user
        .click(within(ownerRow).getByRole("button", { name: /Robin Owner/ }))
        .then(async () => {
          const trigger = await screen.findByRole("button", { name: "Asset owner" });
          await user.click(trigger);
          return trigger;
        });
    };

    await openOwnerPicker();
    await screen.findAllByText("Morgan Analyst");
    fireEvent.click(screen.getByRole("option", { name: /Morgan Analyst/ }));
    await waitFor(() =>
      expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1),
    );
    expect(within(ownerRow).getByText("Robin Owner")).toBeInTheDocument();

    await openOwnerPicker();
    await screen.findAllByText("Morgan Analyst");
    fireEvent.click(screen.getByRole("option", { name: /Morgan Analyst/ }));
    await waitFor(() => expect(within(ownerRow).getByText("Morgan Analyst")).toBeInTheDocument());
    expect(
      requests.filter(
        (request) =>
          request.path === `/api/assets/${WithCustomFields.args.asset!.id}` &&
          request.method === "PATCH",
      ),
    ).toHaveLength(2);
  });

  it("shows reset actions only for asset-specific values", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reset Category" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Reset Deployment tier" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Reset Priority" })).toBeNull();
    });
  });

  it("sends a complete replacement when editing a text value", async () => {
    render(<WithCustomFields />);

    await screen.findByText("Internet-facing");
    const requests = captureFetchRequests();

    fireEvent.click(screen.getByText("Internet-facing"));
    fireEvent.change(screen.getByDisplayValue("Internet-facing"), {
      target: { value: "Internal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));

    await screen.findByText("Internal");
    const request = await waitForRequest(
      requests,
      `/api/assets/${WithCustomFields.args.asset!.id}/custom-fields`,
      "PUT",
    );

    expect(request.body).toEqual({
      values: [
        {
          fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
          value: "Internal",
        },
        {
          fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
          value: null,
        },
        {
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: "production",
        },
        {
          fieldId: "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
          value: null,
        },
      ],
    });
  });

  it("preserves zero and maps a cleared optional number to null", async () => {
    render(<WithCustomFields />);

    await screen.findByText("3");
    const requests = captureFetchRequests();

    fireEvent.click(screen.getByText("3"));
    fireEvent.change(screen.getByDisplayValue("3"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));

    await screen.findByText("0");
    const zeroRequest = await waitForRequest(
      requests,
      `/api/assets/${WithCustomFields.args.asset!.id}/custom-fields`,
      "PUT",
    );
    expect(zeroRequest.body).toEqual({
      values: [
        {
          fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
          value: "Internet-facing",
        },
        {
          fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
          value: 0,
        },
        {
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: "production",
        },
        {
          fieldId: "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
          value: null,
        },
      ],
    });

    fireEvent.click(screen.getByText("0"));
    fireEvent.change(screen.getByDisplayValue("0"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));

    await screen.findAllByText("None");
    const clearRequest = requests.filter(
      (request) =>
        request.path === `/api/assets/${WithCustomFields.args.asset!.id}/custom-fields` &&
        request.method === "PUT",
    )[1];
    expect(clearRequest.body).toEqual({
      values: [
        {
          fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
          value: "Internet-facing",
        },
        {
          fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
          value: null,
        },
        {
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: "production",
        },
        {
          fieldId: "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
          value: null,
        },
      ],
    });
  });

  it("sends a complete replacement when editing a select value", async () => {
    const user = userEvent.setup();
    render(<WithCustomFields />);

    await waitFor(() => expect(screen.getAllByText("Production").length).toBeGreaterThan(0));
    const requests = captureFetchRequests();
    const productionValue = screen.getAllByRole("button", { name: "Production" }).at(-1);

    if (!productionValue) {
      throw new Error("Expected the asset select value");
    }

    await user.click(productionValue);
    await user.click(await screen.findByRole("option", { name: "Staging" }));

    await screen.findAllByText("Staging");
    const request = await waitForRequest(
      requests,
      `/api/assets/${WithCustomFields.args.asset!.id}/custom-fields`,
      "PUT",
    );

    expect(request.body).toEqual({
      values: [
        {
          fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
          value: "Internet-facing",
        },
        {
          fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
          value: null,
        },
        {
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: "staging",
        },
        {
          fieldId: "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
          value: null,
        },
      ],
    });
  });

  it("uses the complete replacement payload for text, number, and select resets", async () => {
    const customFields = (WithCustomFields.args.customFields as Array<AssetCustomFieldValue>).map(
      (field) =>
        field.fieldId === "2808e68c-9a48-4b50-9a2d-d1df4c83ff06"
          ? { ...field, source: AssetCustomFieldValueSource.Asset }
          : field,
    );
    render(<WithCustomFields customFields={customFields} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reset Category" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset Priority" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reset Deployment tier" })).toBeInTheDocument();
    });
    const requests = captureFetchRequests();
    const customFieldsPath = `/api/assets/${WithCustomFields.args.asset!.id}/custom-fields`;

    fireEvent.click(screen.getByRole("button", { name: "Reset Category" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Reset Category" })).toBeNull(),
    );
    expect((await waitForRequest(requests, customFieldsPath, "PUT")).body).toEqual({
      values: [
        {
          fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
          value: null,
        },
        {
          fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
          value: 3,
        },
        {
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: "production",
        },
        {
          fieldId: "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
          value: null,
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset Priority" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Reset Priority" })).toBeNull(),
    );
    const resetRequests = requests.filter(
      (request) => request.path === customFieldsPath && request.method === "PUT",
    );
    expect(resetRequests[1]?.body).toEqual({
      values: [
        {
          fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
          value: null,
        },
        {
          fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
          value: null,
        },
        {
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: "production",
        },
        {
          fieldId: "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
          value: null,
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset Deployment tier" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Reset Deployment tier" })).toBeNull(),
    );
    const finalResetRequests = requests.filter(
      (request) => request.path === customFieldsPath && request.method === "PUT",
    );
    expect(finalResetRequests[2]?.body).toEqual({
      values: [
        {
          fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
          value: null,
        },
        {
          fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
          value: null,
        },
        {
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: null,
        },
        {
          fieldId: "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
          value: null,
        },
      ],
    });
  });

  it("hides a custom field reset action while inline editing", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reset Category" })).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Internet-facing"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Internet-facing")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Reset Category" })).toBeNull();
    });
  });

  it("keeps selected custom field values in the Storybook mock", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getAllByText("Production").length).toBeGreaterThan(0);
    });

    const environmentButtons = screen.getAllByRole("button", { name: "Production" });
    fireEvent.click(environmentButtons[environmentButtons.length - 1]);
    fireEvent.click(await screen.findByText("Staging"));

    await waitFor(() => {
      expect(screen.getByText("Staging")).toBeTruthy();
    });
  });

  it("assigns available custom fields from the sidebar picker", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add custom field" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }));
    fireEvent.click(await screen.findByText("Lifecycle"));

    await waitFor(() => {
      expect(screen.getAllByText("Lifecycle").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove Lifecycle" })).toBeTruthy();
    });
  });

  it("disables custom-field assignment while available fields are loading", async () => {
    const { availableFieldsDeferred } = renderWithLocalAssetDetailHarness({
      availableCustomFields: "pending",
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add custom field" })).toBeDisabled(),
    );

    availableFieldsDeferred.resolve(
      assetCustomFieldDefinitionsResponse([
        {
          id: "497eab4a-74aa-46e4-8fda-3f160dc91f72",
          key: "lifecycle",
          name: "Lifecycle",
          required: false,
          type: AssetCustomFieldType.Text,
          defaultValue: null,
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add custom field" })).toBeEnabled(),
    );
  });

  it.each([
    ["failed", "error" as const],
    ["unavailable", [] as Array<AssetCustomFieldDefinition>],
  ])("keeps assignment disabled when fields are %s", async (_state, availableCustomFields) => {
    renderWithLocalAssetDetailHarness({ availableCustomFields });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add custom field" })).toBeDisabled(),
    );
  });

  it("preserves existing associations when assigning and detaching custom fields", async () => {
    render(<WithCustomFields />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add custom field" })).toBeEnabled(),
    );
    const requests = captureFetchRequests();
    const associationsPath = `/api/assets/${WithCustomFields.args.asset!.id}/custom-fields/associations`;

    fireEvent.click(screen.getByRole("button", { name: "Add custom field" }));
    fireEvent.click(await screen.findByText("Lifecycle"));
    await screen.findByRole("button", { name: "Remove Lifecycle" });

    const assignRequest = await waitForRequest(requests, associationsPath, "PUT");
    expect(assignRequest.body).toEqual({
      fieldIds: [
        "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
        "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
        "7f732d2b-8985-4551-b45d-0eaf527a1577",
        "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
        "497eab4a-74aa-46e4-8fda-3f160dc91f72",
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Team" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove Team" })).toBeNull());
    const associationRequests = requests.filter(
      (request) => request.path === associationsPath && request.method === "PUT",
    );
    expect(associationRequests[1]?.body).toEqual({
      fieldIds: [
        "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
        "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
        "7f732d2b-8985-4551-b45d-0eaf527a1577",
        "497eab4a-74aa-46e4-8fda-3f160dc91f72",
      ],
    });
  });

  it("changes asset owners from the sidebar", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0);
    });

    const ownerButtons = screen.getAllByRole("button", { name: "Robin Owner" });
    fireEvent.click(ownerButtons[ownerButtons.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: "Asset owner" }));
    const morganOptions = await screen.findAllByText("Morgan Owner");
    fireEvent.click(morganOptions[morganOptions.length - 1]);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Asset owner" })).toBeNull();
      expect(screen.getAllByText("Morgan Owner").length).toBeGreaterThan(0);
    });
  });

  it("clears asset owners from the sidebar", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0);
    });

    const ownerButtons = screen.getAllByRole("button", { name: "Robin Owner" });
    fireEvent.click(ownerButtons[ownerButtons.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: "Asset owner" }));
    fireEvent.click(await screen.findByRole("option", { name: "No Owner" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Asset owner" })).toBeNull();
      expect(screen.getAllByText("No Owner").length).toBeGreaterThan(0);
    });
  });

  it("shows an error when asset owner updates fail", async () => {
    render(<OwnerUpdateError />);

    await waitFor(() => {
      expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0);
    });

    const ownerButtons = screen.getAllByRole("button", { name: "Robin Owner" });
    fireEvent.click(ownerButtons[ownerButtons.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: "Asset owner" }));
    const morganOptions = await screen.findAllByText("Morgan Owner");
    fireEvent.click(morganOptions[morganOptions.length - 1]);

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        expect.anything(),
        "Failed to update asset",
      );
    });
  });

  it("detaches custom fields from the asset sidebar", async () => {
    render(<WithCustomFields />);

    await waitFor(() => {
      expect(screen.getAllByText("Team").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Remove Team" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Team" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Remove Team" })).toBeNull();
      expect(screen.queryByText("Team")).toBeNull();
    });
  });

  it("renders an empty custom field state", async () => {
    render(<EmptyCustomFields />);

    await waitFor(() => {
      expect(screen.getByText("No custom fields")).toBeTruthy();
    });
  });

  it("renders a loading state for custom fields without hiding asset details", async () => {
    const { container } = render(<LoadingCustomFields />);

    await waitFor(() => {
      expect(screen.getAllByText("web-01").length).toBeGreaterThan(0);
      expect(screen.getByLabelText("Custom fields loading")).toBeTruthy();
      expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    });
  });

  it("renders a custom field error state without hiding asset details", async () => {
    render(<CustomFieldsError />);

    await waitFor(() => {
      expect(screen.getAllByText("web-01").length).toBeGreaterThan(0);
      expect(screen.getByText("Unable to load custom fields")).toBeTruthy();
    });
  });

  it("renders an error state when the primary asset query fails", async () => {
    render(<ErrorState />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load asset")).toBeTruthy();
      expect(screen.getByText("Asset failed")).toBeTruthy();
    });
  });
});
