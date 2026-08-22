import { QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { expect, fn, mocked } from "storybook/test";

import { createListUsersQueryOptions } from "@/api/user.ts";
import { STORY_ASSETS } from "@/components/storybook-fixtures.ts";
import { createStoryQueryClient } from "@/components/storybook-utils.tsx";
import { PageProvider } from "@/context/page.tsx";
import { CreateFindingPage } from "@/features/findings/components/create-finding-page.tsx";
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts";

import type { Meta, StoryObj } from "@storybook/react-vite";

const USERS = [
  {
    id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    username: "alex",
    displayName: "Alex Assignee",
    email: "alex@example.com",
    enabled: true,
    roleIds: [] as Array<string>,
  },
];

const meta = {
  title: "Features/Findings/CreateFindingPage",
  component: CreateFindingPage,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    onClose: fn(),
  },
  decorators: [
    (Story) => {
      const queryClient = createStoryQueryClient();
      queryClient.setQueryData(["assets"], STORY_ASSETS);

      return (
        <QueryClientProvider client={queryClient}>
          <PageProvider>
            <main className="mx-auto flex min-h-svh w-full max-w-5xl items-start p-6 md:p-10">
              <Story />
            </main>
          </PageProvider>
        </QueryClientProvider>
      );
    },
  ],
  beforeEach: () => {
    mocked(createListUsersQueryOptions).mockReturnValue(
      queryOptions({
        queryKey: ["users"],
        queryFn: async () => USERS,
      }),
    );
    mocked(useFindingLifecycle).mockReturnValue({
      createFinding: fn(async () => null),
    } as unknown as ReturnType<typeof useFindingLifecycle>);
  },
} satisfies Meta<typeof CreateFindingPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ValidationErrors: Story = {
  play: async ({ canvas }) => {
    canvas.getByRole("button", { name: /create finding/i }).click();
    await expect(canvas.findAllByRole("alert")).resolves.not.toHaveLength(0);
  },
};
