import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";

function renderCollapsible(props: { defaultOpen?: boolean } = {}) {
  render(
    <Collapsible {...props}>
      <CollapsibleTrigger>
        <CollapsibleChevron />
        Observations
      </CollapsibleTrigger>
      <CollapsibleContent>First seen by the scanner</CollapsibleContent>
    </Collapsible>,
  );

  return screen.getByRole("button", { name: "Observations" });
}

describe("Collapsible", () => {
  it("opens and closes its content from the trigger", async () => {
    const user = userEvent.setup();
    const trigger = renderCollapsible();

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("First seen by the scanner")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("First seen by the scanner")).toBeVisible();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("First seen by the scanner")).not.toBeInTheDocument();
  });

  it("starts open when asked to", () => {
    const trigger = renderCollapsible({ defaultOpen: true });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("First seen by the scanner")).toBeVisible();
  });
});
