import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DateField } from "@/components/date-picker.tsx";
import { formatDate } from "@/lib/format.ts";

function ControlledDateField({
  initialValue,
  onChange,
}: {
  initialValue: Date | null;
  onChange: (value: Date | null) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <>
      <label htmlFor="due-date">Due date</label>
      <DateField
        id="due-date"
        value={value}
        placeholder="No due date"
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </>
  );
}

describe("DateField", () => {
  it("shows the placeholder, then the picked day in the app's date format", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ControlledDateField
        initialValue={new Date("2026-02-01T00:00:00.000Z")}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Due date" });
    expect(trigger).toHaveTextContent(
      formatDate(new Date("2026-02-01T00:00:00.000Z"), { timeZone: "UTC" }),
    );

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: /February 15th, 2026/ }));

    // Picked days are date-only values at UTC midnight, whatever the browser's time zone.
    expect(onChange).toHaveBeenCalledWith(new Date("2026-02-15T00:00:00.000Z"));
    await waitFor(() => expect(screen.queryByRole("grid")).not.toBeInTheDocument());
    expect(trigger).toHaveTextContent(
      formatDate(new Date("2026-02-15T00:00:00.000Z"), { timeZone: "UTC" }),
    );
  });

  it("clears the date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ControlledDateField
        initialValue={new Date("2026-02-01T00:00:00.000Z")}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Due date" });

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(trigger).toHaveTextContent("No due date");
  });

  it("offers no Clear button without a date", async () => {
    const user = userEvent.setup();
    render(<ControlledDateField initialValue={null} onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Due date" });
    expect(trigger).toHaveTextContent("No due date");
    await user.click(trigger);

    expect(await screen.findByRole("grid")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
