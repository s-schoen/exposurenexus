import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import * as stories from "@/components/metric-card.stories";
import { MetricCard } from "@/components/metric-card.tsx";

const { Default, Loading, Panel, WithoutIcon } = composeStories(stories);

afterEach(() => {
  cleanup();
});

describe("MetricCard stories", () => {
  it("renders the primary card metric", () => {
    render(<Default />);

    expect(screen.getByText("Critical / high")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
    expect(screen.getByText("Highest severity exposure right now")).toBeVisible();
  });

  it("renders the panel metric variant", () => {
    render(<Panel />);

    expect(screen.getByText("Mitigated rate")).toBeVisible();
    expect(screen.getByText("84%")).toBeVisible();
    expect(screen.getByText("Share of findings already mitigated")).toBeVisible();
  });

  it("renders loading placeholders instead of metric values", () => {
    const { container } = render(<Loading />);

    expect(screen.getByText("Critical / high")).toBeVisible();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  });

  it("renders content when the icon is hidden", () => {
    render(<WithoutIcon />);

    expect(screen.getByText("Affected assets")).toBeVisible();
    expect(screen.getByText("37")).toBeVisible();
    expect(screen.getByText("Assets with at least one linked finding")).toBeVisible();
  });

  it("hides panel values and descriptions while loading, then restores them", () => {
    const { container, rerender } = render(
      <MetricCard
        title="Mitigated rate"
        value="84%"
        description="Share of findings already mitigated"
        icon={Activity}
        variant="panel"
        loading={true}
      />,
    );

    expect(screen.getByText("Mitigated rate")).toBeVisible();
    expect(screen.queryByText("84%")).not.toBeInTheDocument();
    expect(screen.queryByText("Share of findings already mitigated")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
    expect(container.querySelector("svg")).not.toBeNull();

    rerender(
      <MetricCard
        title="Mitigated rate"
        value="84%"
        description="Share of findings already mitigated"
        icon={Activity}
        variant="panel"
      />,
    );

    expect(screen.getByText("84%")).toBeVisible();
    expect(screen.getByText("Share of findings already mitigated")).toBeVisible();
  });

  it("supports a metric without a description", () => {
    render(<MetricCard title="Total findings" value={0} icon={Activity} />);

    expect(screen.getByText("Total findings")).toBeVisible();
    expect(screen.getByText("0")).toBeVisible();
    expect(screen.queryByText("No description")).not.toBeInTheDocument();
  });

  it.each([
    ["shows", Activity, true, true],
    ["hides when disabled", Activity, false, false],
    ["hides when no icon is supplied", undefined, true, false],
  ])("%s the icon according to its public props", (_case, icon, showIcon, hasIcon) => {
    const { container } = render(
      <MetricCard title="Affected assets" value={3} icon={icon} showIcon={showIcon} />,
    );

    expect(container.querySelector("svg") !== null).toBe(hasIcon);
  });
});
