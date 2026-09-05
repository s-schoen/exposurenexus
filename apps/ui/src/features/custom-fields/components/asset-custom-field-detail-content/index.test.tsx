import { composeStories } from "@storybook/react-vite";
import { render, screen, cleanup } from "@testing-library/react";
import { it, expect, afterEach } from "vitest";

import * as stories from "@/features/custom-fields/components/asset-custom-field-detail-content/index.stories";

const { Default } = composeStories(stories);
afterEach(cleanup);
it("renders resolved data without a query provider", () => {
  render(<Default />);
  expect(screen.getAllByText(Default.args.field!.name).length).toBeGreaterThan(0);
});
