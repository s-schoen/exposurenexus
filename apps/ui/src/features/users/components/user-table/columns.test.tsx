import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createColumns } from "@/features/users/components/user-table/columns.tsx";
import { buildUser } from "@/mocks/fixtures/index.ts";

import type { UserProfile } from "@exposurenexus/contracts/model/user";

function findColumn(columns: ReturnType<typeof createColumns>, id: string) {
  const column = columns.find(
    (candidate) =>
      ("id" in candidate && candidate.id === id) ||
      ("accessorKey" in candidate && candidate.accessorKey === id),
  );
  if (!column) {
    throw new Error(`Missing column ${id}`);
  }
  return column;
}

function renderCell(cell: unknown, user: UserProfile) {
  if (typeof cell !== "function") {
    throw new Error("Expected a cell renderer");
  }
  return render(<>{cell({ row: { original: user } })}</>);
}

describe("user table columns", () => {
  it("shows role counts while role names are unavailable", () => {
    const roles = findColumn(createColumns(new Map(), false), "roles");

    renderCell(roles.cell, buildUser({ roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor] }));

    expect(screen.getByText("2 roles")).toBeVisible();
  });

  it("shows resolved role names, unknown roles and users without roles", () => {
    const roles = findColumn(
      createColumns(
        new Map([
          [builtInRoleIds.viewer, "viewer"],
          [builtInRoleIds.editor, "editor"],
        ]),
        true,
      ),
      "roles",
    );

    const { unmount } = renderCell(
      roles.cell,
      buildUser({
        roleIds: [
          builtInRoleIds.viewer,
          builtInRoleIds.editor,
          "a1ed0f1c-28af-40f4-b08e-9fe9ab4a3223",
        ],
      }),
    );
    expect(screen.getByText("viewer")).toBeVisible();
    expect(screen.getByText("editor")).toBeVisible();
    expect(screen.getByText("+1 unknown")).toBeVisible();
    unmount();

    renderCell(roles.cell, buildUser({ roleIds: [] }));
    expect(screen.getByText("No roles")).toBeVisible();
  });

  it("filters enabled rows from string filter values", () => {
    const { filterFn } = findColumn(createColumns(new Map(), false), "enabled");
    if (typeof filterFn !== "function") {
      throw new Error("Expected a filter function");
    }
    const row = (enabled: boolean) => ({ getValue: () => enabled }) as never;

    expect(filterFn(row(true), "enabled", [], () => undefined)).toBe(true);
    expect(filterFn(row(true), "enabled", ["true"], () => undefined)).toBe(true);
    expect(filterFn(row(false), "enabled", ["true"], () => undefined)).toBe(false);
  });
});
