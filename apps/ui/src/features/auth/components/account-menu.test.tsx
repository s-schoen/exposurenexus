import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/features/auth/components/account-menu.tsx";

import type { ReactNode } from "react";

interface SessionQuery {
  user: {
    displayName?: string | null;
    email?: string | null;
  } | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

const mocks = vi.hoisted(() => {
  const sessionQuery: SessionQuery = {
    user: {
      displayName: "Alice Example",
      email: "alice@example.com",
    },
    status: "authenticated",
  };

  return {
    navigate: vi.fn(),
    sessionQuery,
    logout: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/features/auth/providers/auth-provider.tsx", () => ({
  useAuth: () => ({
    logout: mocks.logout,
    status: mocks.sessionQuery.status,
    user: mocks.sessionQuery.user,
  }),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ render: trigger }: { render: ReactNode }) => <>{trigger}</>,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => <span>Loading account</span>,
}));

describe("AccountMenu", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.logout.mockReset();
    mocks.sessionQuery = {
      user: {
        displayName: "Alice Example",
        email: "alice@example.com",
      },
      status: "authenticated",
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the current user and signs out through auth context", async () => {
    mocks.logout.mockResolvedValueOnce(undefined);

    render(<AccountMenu />);

    expect(screen.getByText("Alice Example")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("Account")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledTimes(1);
      expect(mocks.navigate).toHaveBeenCalledWith({
        search: { redirect: "/" },
        to: "/login",
      });
    });
  });

  it("falls back to email and shows a spinner while the session is pending", async () => {
    mocks.sessionQuery = {
      user: {
        displayName: null,
        email: "alice@example.com",
      },
      status: "authenticated",
    };

    const { rerender } = render(<AccountMenu />);

    expect(screen.getByText("alice@example.com")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();

    mocks.sessionQuery = {
      user: null,
      status: "loading",
    };
    rerender(<AccountMenu />);

    expect(screen.getByText("Loading account")).toBeTruthy();
  });
});
