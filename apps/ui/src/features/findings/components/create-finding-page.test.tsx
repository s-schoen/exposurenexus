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
    value?: string;
  }>({});

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
      value?: string;
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
      children?: ReactNode | ((value: string | undefined) => ReactNode);
      placeholder?: string;
    }) => {
      const { value } = React.useContext(SelectContext);
      const content = typeof children === "function" ? children(value) : (value ?? children);

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

    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(mocks.createFinding).not.toHaveBeenCalled();
  });

  it("cancels back to the previous page", () => {
    renderCreateFindingPage();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mocks.historyBack).toHaveBeenCalledTimes(1);
  });

  it("shows the default severity and status selections", () => {
    renderCreateFindingPage();

    expect(screen.getByLabelText(/severity/i).textContent).toMatch(/medium/i);
    expect(screen.getByLabelText(/status/i).textContent).toMatch(/active/i);
  });

  it("submits a valid finding and navigates back on success", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });

    fireEvent.change(screen.getByLabelText(/vulnerability id/i), {
      target: {
        value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
    fireEvent.change(screen.getByLabelText(/source/i), {
      target: {
        value: "manual",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith({
        assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
        evidence: null,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        severity: VulnerabilitySeverity.Medium,
        source: "manual",
        status: FindingStatus.Active,
        vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      });
    });
    expect(mocks.createFinding).toHaveBeenCalledTimes(1);
    expect(mocks.historyBack).toHaveBeenCalledTimes(1);
  });

  it("submits a valid finding with selected severity and status", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });

    fireEvent.change(screen.getByLabelText(/vulnerability id/i), {
      target: {
        value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
    fireEvent.click(screen.getByRole("button", { name: /critical/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmed/i }));
    fireEvent.change(screen.getByLabelText(/source/i), {
      target: {
        value: "manual",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: VulnerabilitySeverity.Critical,
          status: FindingStatus.Confirmed,
        }),
      );
    });
    expect(mocks.createFinding).toHaveBeenCalledTimes(1);
  });

  it("submits a valid finding with a selected due date", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });

    fireEvent.change(screen.getByLabelText(/vulnerability id/i), {
      target: {
        value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
    fireEvent.change(screen.getByLabelText(/source/i), {
      target: {
        value: "manual",
      },
    });
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: {
        value: "2026-05-06",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: new Date("2026-05-06T00:00:00.000Z"),
        }),
      );
    });
  });

  it("submits a valid finding with a selected assignee", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });

    fireEvent.change(screen.getByLabelText(/vulnerability id/i), {
      target: {
        value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
    fireEvent.change(screen.getByLabelText(/source/i), {
      target: {
        value: "manual",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Alex Assignee" }));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          assigneeId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
        }),
      );
    });
  });

  it("clears a selected assignee before creating", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });

    fireEvent.change(screen.getByLabelText(/vulnerability id/i), {
      target: {
        value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
    fireEvent.change(screen.getByLabelText(/source/i), {
      target: {
        value: "manual",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Alex Assignee" }));
    fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          assigneeId: null,
        }),
      );
    });
  });

  it("stays on the form when create finding fails", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce(null);

    fireEvent.change(screen.getByLabelText(/vulnerability id/i), {
      target: {
        value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
    fireEvent.change(screen.getByLabelText(/source/i), {
      target: {
        value: "manual",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledTimes(1);
    });
    expect(mocks.historyBack).not.toHaveBeenCalled();
  });
});
