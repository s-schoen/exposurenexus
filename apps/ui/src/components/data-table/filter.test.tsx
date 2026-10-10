import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTableFilter } from "@/components/data-table/filter.tsx";

afterEach(cleanup);

// The value usually comes from the URL and lags behind the keystrokes that change it.

describe("DataTableFilter", () => {
  it("keeps typed text while its value lags behind", async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn<(value: string) => void>();
    render(<DataTableFilter value="" onFilterChange={onFilterChange} onClearAll={() => {}} />);
    const input = screen.getByLabelText("Search across visible columns");

    await user.type(input, "tls");

    expect(input).toHaveValue("tls");
    expect(onFilterChange).toHaveBeenLastCalledWith("tls");
  });

  it("shows its value again once the input loses focus", async () => {
    const user = userEvent.setup();
    const props = { onFilterChange: () => {}, onClearAll: () => {} };
    const { rerender } = render(<DataTableFilter value="" {...props} />);
    const input = screen.getByLabelText("Search across visible columns");

    await user.type(input, "tls");
    await user.tab();
    expect(input).toHaveValue("");

    rerender(<DataTableFilter value="admin" {...props} />);
    expect(input).toHaveValue("admin");
  });
});
