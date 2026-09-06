import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageProvider, usePage, usePageMeta } from "@/hooks/use-page-meta.tsx";

import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { ReactNode } from "react";

function PageConsumer() {
  const { title, description, actions } = usePage();

  return (
    <section aria-label="Page metadata">
      <h1>{title || "Untitled page"}</h1>
      <p>{description || "No description"}</p>
      <div aria-label="Page actions">
        {actions.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PageMetaHarness({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: Array<PageAction>;
}) {
  usePageMeta({ title, description, actions });
  return null;
}

function renderPage({
  children,
  meta,
}: {
  children?: ReactNode;
  meta?: ReactNode;
} = {}) {
  return render(
    <PageProvider>
      <PageConsumer />
      {meta}
      {children}
    </PageProvider>,
  );
}

afterEach(cleanup);

describe("PageProvider and usePageMeta", () => {
  it("exposes empty initial metadata and defaults omitted values", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Untitled page" })).toBeVisible();
    expect(screen.getByText("No description")).toBeVisible();
    expect(screen.getByLabelText("Page actions")).toBeEmptyDOMElement();
  });

  it("updates visible metadata, replaces actions, and invokes the current action", async () => {
    const user = userEvent.setup();
    const createAction: PageAction = {
      label: "Create asset",
      icon: Activity,
      onClick: vi.fn(),
    };
    const manageAction: PageAction = {
      label: "Manage users",
      onClick: vi.fn(),
    };
    const { rerender } = renderPage({
      meta: (
        <PageMetaHarness
          title="Assets"
          description="Track the asset inventory."
          actions={[createAction]}
        />
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Assets" })).toBeVisible();
      expect(screen.getByText("Track the asset inventory.")).toBeVisible();
      expect(screen.getByRole("button", { name: "Create asset" })).toBeVisible();
    });

    await user.click(screen.getByRole("button", { name: "Create asset" }));
    expect(createAction.onClick).toHaveBeenCalledOnce();

    rerender(
      <PageProvider>
        <PageConsumer />
        <PageMetaHarness title="Users" actions={[manageAction]} />
      </PageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Users" })).toBeVisible();
      expect(screen.getByText("No description")).toBeVisible();
      expect(screen.getByRole("button", { name: "Manage users" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Create asset" })).not.toBeInTheDocument();
    });
  });

  it("cleans actions when a page unmounts or navigation replaces it", async () => {
    const firstAction: PageAction = { label: "Asset action", onClick: vi.fn() };
    const nextAction: PageAction = { label: "User action", onClick: vi.fn() };
    const { rerender } = renderPage({
      meta: <PageMetaHarness title="Assets" actions={[firstAction]} />,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Asset action" })).toBeVisible();
    });

    rerender(
      <PageProvider>
        <PageConsumer />
        <PageMetaHarness key="users" title="Users" actions={[nextAction]} />
      </PageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "User action" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Asset action" })).not.toBeInTheDocument();
    });

    rerender(
      <PageProvider>
        <PageConsumer />
      </PageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Page actions")).toBeEmptyDOMElement();
    });
  });

  it("throws when usePage is rendered outside a provider", () => {
    function OutsideConsumer() {
      usePage();
      return null;
    }

    expect(() => render(<OutsideConsumer />)).toThrow(
      "usePage must be used within an PageProvider",
    );
  });
});
