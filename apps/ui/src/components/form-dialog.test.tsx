import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FormActions, FormDialog } from "@/components/form-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";

function renderFormDialog({ submitting = false } = {}) {
  const onOpenChange = vi.fn();

  render(
    <FormDialog title="Create thing" open onOpenChange={onOpenChange} submitting={submitting}>
      <form>
        <label>
          Name
          <input />
        </label>
        <FormActions>
          <Button type="submit">Create</Button>
        </FormActions>
      </form>
    </FormDialog>,
  );

  return onOpenChange;
}

describe("FormDialog", () => {
  it("titles the dialog and renders the form with its actions", () => {
    renderFormDialog();

    const dialog = screen.getByRole("dialog", { name: "Create thing" });
    expect(dialog).toContainElement(screen.getByLabelText("Name"));
    expect(dialog).toContainElement(screen.getByRole("button", { name: "Create" }));
  });

  it("closes on Escape and the close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderFormDialog();

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    onOpenChange.mockClear();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps the draft open on a backdrop click", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderFormDialog();

    await user.click(document.querySelector<HTMLElement>("[data-slot='dialog-overlay']")!);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("ignores close requests while submitting", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderFormDialog({ submitting: true });

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("FormActions", () => {
  it("renders the actions inline outside a dialog", () => {
    render(
      <FormActions>
        <Button type="button">Cancel</Button>
      </FormActions>,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });
});
