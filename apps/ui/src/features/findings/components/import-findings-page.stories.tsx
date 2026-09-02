import { expect } from "storybook/test";

import { ImportFindingsPage } from "@/features/findings/components/import-findings-page.tsx";
import { PageProvider } from "@/hooks/use-page-meta.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Features/Findings/ImportFindingsPage",
  component: ImportFindingsPage,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <PageProvider>
        <main className="mx-auto flex min-h-svh w-full max-w-5xl items-start p-6 md:p-10">
          <Story />
        </main>
      </PageProvider>
    ),
  ],
} satisfies Meta<typeof ImportFindingsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unavailable: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: /import findings unavailable/i }),
    ).toBeDisabled();
  },
};
