import { AssetCustomFieldType } from "@exposurenexus/types/model/asset-custom-field";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateCustomFieldPage } from "@/features/custom-fields/components/create-custom-field-page.tsx";

const mocks = vi.hoisted(() => ({
  createDefinition: vi.fn(),
  createdField: {
    id: "7f732d2b-8985-4551-b45d-0eaf527a1577",
    key: "risk_owner",
    name: "Risk Owner",
    required: true,
    type: "text",
    defaultValue: "Security",
  },
  navigate: vi.fn(),
  usePageMeta: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/hooks/use-asset-custom-field-definition-lifecycle.ts", () => ({
  useAssetCustomFieldDefinitionLifecycle: () => ({
    createDefinition: mocks.createDefinition,
  }),
}));

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
HTMLElement.prototype.scrollIntoView = vi.fn();

async function fillValidTextFieldForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: /^name$/i }), "  Risk Owner  ");
  await user.type(screen.getByRole("textbox", { name: /^key$/i }), "  risk_owner  ");
  await user.click(screen.getByRole("checkbox", { name: /required/i }));
  await user.type(screen.getByRole("textbox", { name: /default value/i }), "Security");
}

describe("CreateCustomFieldPage", () => {
  beforeEach(() => {
    mocks.createDefinition.mockReset();
    mocks.navigate.mockReset();
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("cancels back to the custom field definition list", async () => {
    const user = userEvent.setup();

    render(<CreateCustomFieldPage />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/custom-fields",
        search: expect.any(Function),
      });
    });
    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(
      search({
        filter: "owner",
        required: "true",
        selected: "field-1",
        type: "text",
      }),
    ).toEqual({
      filter: "owner",
      required: "true",
      selected: undefined,
      type: "text",
    });
  });

  it("creates a custom field through the lifecycle hook and navigates to detail", async () => {
    const user = userEvent.setup();
    mocks.createDefinition.mockResolvedValueOnce(mocks.createdField);

    render(<CreateCustomFieldPage />);
    await fillValidTextFieldForm(user);
    await user.click(screen.getByRole("button", { name: /create custom field/i }));

    await waitFor(() => {
      expect(mocks.createDefinition).toHaveBeenCalledWith({
        name: "Risk Owner",
        key: "risk_owner",
        type: AssetCustomFieldType.Text,
        required: true,
        defaultValue: "Security",
      });
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields/$id",
      params: { id: mocks.createdField.id },
    });
  });

  it("does not navigate after a handled create failure and leaves the form usable", async () => {
    const user = userEvent.setup();
    mocks.createDefinition.mockResolvedValueOnce(null);

    render(<CreateCustomFieldPage />);
    await fillValidTextFieldForm(user);
    await user.click(screen.getByRole("button", { name: /create custom field/i }));

    await waitFor(() => {
      expect(mocks.createDefinition).toHaveBeenCalledTimes(1);
    });
    expect(mocks.navigate).not.toHaveBeenCalled();

    const submitButton = screen.getByRole("button", {
      name: /create custom field/i,
    });
    const nameInput = screen.getByRole("textbox", { name: /^name$/i });

    expect(submitButton).toBeEnabled();
    expect(nameInput).toHaveValue("  Risk Owner  ");

    await user.clear(nameInput);
    await user.type(nameInput, "Business Unit");

    expect(nameInput).toHaveValue("Business Unit");
  });

  it("shows visible validation errors instead of submitting an empty form", async () => {
    const user = userEvent.setup();

    render(<CreateCustomFieldPage />);
    await user.click(screen.getByRole("button", { name: /create custom field/i }));

    expect(await screen.findByText("Enter a name")).toBeVisible();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(mocks.createDefinition).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
