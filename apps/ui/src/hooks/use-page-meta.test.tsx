import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { PageProvider, usePage, usePageCount, usePageMeta } from "@/hooks/use-page-meta.tsx";

import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { ReactNode } from "react";

function PageConsumer() {
  const { title, breadcrumbs, count, actions, menu } = usePage();

  return (
    <section aria-label="Page metadata">
      <h1>{title || "Untitled page"}</h1>
      <p aria-label="Breadcrumbs">{breadcrumbs.map((crumb) => crumb.label).join(" › ")}</p>
      <p aria-label="Count">{count ?? "No count"}</p>
      <div aria-label="Page actions">
        {[...actions, ...menu].map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PageMetaHarness(props: Parameters<typeof usePageMeta>[0]) {
  usePageMeta(props);
  return null;
}

function PageCountHarness({ count }: { count: number }) {
  usePageCount(count);
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

describe("PageProvider and usePageMeta", () => {
  it("exposes empty initial metadata and defaults omitted values", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Untitled page" })).toBeVisible();
    expect(screen.getByLabelText("Breadcrumbs")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("Count")).toHaveTextContent("No count");
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
          title="web-01"
          breadcrumbs={[{ label: "Assets", to: "/assets" }]}
          actions={[createAction]}
        />
      ),
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "web-01" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Create asset" })).toBeVisible();
    });

    expect(screen.getByLabelText("Breadcrumbs")).toHaveTextContent("Assets");

    await user.click(screen.getByRole("button", { name: "Create asset" }));
    expect(createAction.onClick).toHaveBeenCalledOnce();

    rerender(
      <PageProvider>
        <PageConsumer />
        <PageMetaHarness title="Users" menu={[manageAction]} />
      </PageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Users" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Manage users" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Create asset" })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Breadcrumbs")).toBeEmptyDOMElement();
  });

  it("shows the list's count until the list unmounts", async () => {
    const { rerender } = renderPage({
      meta: (
        <>
          <PageMetaHarness title="Assets" />
          <PageCountHarness count={3} />
        </>
      ),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Count")).toHaveTextContent("3");
    });

    rerender(
      <PageProvider>
        <PageConsumer />
        <PageMetaHarness title="Assets" />
        <PageCountHarness count={1} />
      </PageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Count")).toHaveTextContent("1");
    });

    rerender(
      <PageProvider>
        <PageConsumer />
        <PageMetaHarness title="Assets" />
      </PageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Count")).toHaveTextContent("No count");
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

  it("resets the title and breadcrumbs when a page unmounts", async () => {
    const { rerender } = renderPage({
      meta: (
        <PageMetaHarness title="security-auditor" breadcrumbs={[{ label: "Roles", to: "/" }]} />
      ),
    });

    expect(await screen.findByRole("heading", { name: "security-auditor" })).toBeVisible();

    rerender(
      <PageProvider>
        <PageConsumer />
      </PageProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Untitled page" })).toBeVisible();
    expect(screen.getByLabelText("Breadcrumbs")).toBeEmptyDOMElement();
  });

  it("does not re-render a page that passes new actions on every render", async () => {
    const rendered = vi.fn<() => void>();
    function UnstableActionsPage() {
      rendered();
      // A render loop would hang jsdom instead of failing; stop it.
      if (rendered.mock.calls.length > 10) {
        throw new Error("UnstableActionsPage re-renders in a loop");
      }
      usePageMeta({ title: "Assets", actions: [{ label: "Create asset", onClick: () => {} }] });
      return null;
    }

    renderPage({ meta: <UnstableActionsPage /> });

    expect(await screen.findByRole("button", { name: "Create asset" })).toBeVisible();
    expect(rendered).toHaveBeenCalledOnce();
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
