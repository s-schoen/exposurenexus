import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateFindingPage } from "@/features/findings/components/create-finding-page.tsx";

import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  createFinding: vi.fn(),
  historyBack: vi.fn(),
  usePageMeta: vi.fn(),
  users: [
    {
      id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
      username: "alex",
      displayName: "Alex Assignee",
      email: "alex@example.com",
      enabled: true,
      roleIds: [],
    },
    {
      id: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
      username: "sam",
      displayName: "",
      email: "sam@example.com",
      enabled: false,
      roleIds: [],
    },
  ],
}));

vi.mock("@/components/asset-combobox.tsx", () => ({
  AssetCombobox: ({ onChange }: { onChange?: (asset: { id: string }) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange?.({
          id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
        })
      }
    >
      Select asset
    </button>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mocks.users,
    isPending: false,
    isSuccess: true,
  }),
}));

vi.mock("@/api/user.ts", () => ({
  createListUsersQueryOptions: () => ({
    queryKey: ["users"],
  }),
}));

vi.mock("@/components/ui/select.tsx", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
    value?: string | null;
  }>({});

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
      value?: string | null;
    }) => (
      <SelectContext.Provider value={{ onValueChange, value }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const { onValueChange } = React.useContext(SelectContext);

      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
      <button type="button" role="combobox" id={id}>
        {children}
      </button>
    ),
    SelectValue: ({
      children,
      placeholder,
    }: {
      children?: ReactNode | ((value: string | null | undefined) => ReactNode);
      placeholder?: string;
    }) => {
      const { value } = React.useContext(SelectContext);
      const content = typeof children === "function" ? children(value) : (children ?? value);

      return <span>{content ?? placeholder}</span>;
    },
  };
});

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    createFinding: mocks.createFinding,
  }),
}));

function renderCreateFindingPage() {
  return render(<CreateFindingPage onClose={mocks.historyBack} />);
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/^title$/i), {
    target: { value: "Exposed admin panel" },
  });
  fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
}

describe("CreateFindingPage", () => {
  beforeEach(() => {
    mocks.createFinding.mockReset();
    mocks.historyBack.mockReset();
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not submit invalid required fields", () => {
    renderCreateFindingPage();

    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    expect(mocks.createFinding).not.toHaveBeenCalled();
  });

  it("cancels back to the previous page", () => {
    renderCreateFindingPage();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mocks.historyBack).toHaveBeenCalledTimes(1);
  });

  it("shows the canonical empty identity defaults", () => {
    renderCreateFindingPage();

    expect(screen.getByLabelText(/severity/i).textContent).toMatch(/medium/i);
    expect(screen.getByLabelText(/status/i).textContent).toMatch(/active/i);
    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    expect(screen.getByLabelText(/affected resource/i).textContent).toMatch(/unspecified/i);
  });

  it("submits a finding with its initial manual observation defaults", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith({
        assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
        title: "Exposed admin panel",
        severity: VulnerabilitySeverity.Medium,
        status: FindingStatus.Active,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        vulnerabilityIds: [],
        observation: {},
      });
    });
    expect(mocks.historyBack).toHaveBeenCalledTimes(1);
  });

  it("submits selected resource, catalog, and observation values", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();

    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    fireEvent.click(screen.getByRole("button", { name: /web endpoint/i }));
    fireEvent.change(screen.getByLabelText(/catalog entry ids/i), {
      target: { value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe" },
    });

    fireEvent.click(screen.getByRole("tab", { name: /observation/i }));
    fireEvent.change(screen.getByLabelText(/^evidence$/i), {
      target: { value: "GET /admin returned 200" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          affectedResource: { type: AffectedResourceType.WebEndpoint },
          vulnerabilityIds: ["9d7acdd0-fad1-46c9-8218-1793f421f0fe"],
          observation: {
            evidence: "GET /admin returned 200",
          },
        }),
      );
    });
  });

  it("supports severity, status, due date, and assignment", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /critical/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmed/i }));
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: "2026-05-06" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Alex Assignee" }));
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: VulnerabilitySeverity.Critical,
          status: FindingStatus.Confirmed,
          dueDate: new Date("2026-05-06T00:00:00.000Z"),
          assigneeId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
        }),
      );
    });
  });

  it("renders the selected assignee label", () => {
    renderCreateFindingPage();

    fireEvent.click(screen.getByRole("button", { name: "Alex Assignee" }));

    expect(screen.getByLabelText(/assignee/i)).toHaveTextContent("Alex Assignee");
  });

  it("clears a selected assignee before creating", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Alex Assignee" }));
    fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: null }),
      );
    });
  });

  it("stays on the form when creation fails", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce(null);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => expect(mocks.createFinding).toHaveBeenCalledTimes(1));
    expect(mocks.historyBack).not.toHaveBeenCalled();
  });
});
