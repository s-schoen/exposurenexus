import { useLayoutEffect, useMemo } from "react";
import { fn } from "storybook/test";

import { UserTable } from "@/components/user-table";
import { ROLE_FIXTURES, STORY_USERS } from "@/test/fixtures.ts";
import {
  RouterStoryProvider,
  createArrayResponse,
  createStoryQueryClient,
} from "@/test/storybook.tsx";

import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { Meta, StoryObj } from "@storybook/react-vite";

type UserTableStoryArgs = {
  users: Array<UserProfile>;
  scenario: "default" | "empty" | "loading" | "roles-loading";
  selectedUserId?: string;
  onSelectUser?: (user: UserProfile) => void;
  onCreateUser?: () => void;
};

function UserTableStoryShell({
  users,
  scenario,
  selectedUserId,
  onSelectUser,
  onCreateUser,
}: UserTableStoryArgs) {
  const effectiveUsers = scenario === "empty" ? [] : users;
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    if (scenario !== "loading") {
      client.setQueryData(["users"], effectiveUsers);
    }

    if (scenario !== "loading" && scenario !== "roles-loading") {
      client.setQueryData(["roles"], ROLE_FIXTURES);
    }

    return client;
  }, [effectiveUsers, scenario]);

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);

      if (requestUrl.endsWith("/api/users")) {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {});
        }

        return createArrayResponse(effectiveUsers);
      }

      if (requestUrl.endsWith("/api/roles")) {
        if (scenario === "loading" || scenario === "roles-loading") {
          return await new Promise<Response>(() => {});
        }

        return createArrayResponse(ROLE_FIXTURES);
      }

      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [effectiveUsers, scenario]);

  return (
    <RouterStoryProvider queryClient={queryClient} initialPath="/users">
      <div className="w-full max-w-6xl">
        <UserTable
          selectedUserId={selectedUserId}
          onSelectUser={onSelectUser}
          onCreateUser={onCreateUser}
        />
      </div>
    </RouterStoryProvider>
  );
}

const meta = {
  title: "Resources/Users/Table",
  component: UserTableStoryShell,
  tags: ["!test"],
  parameters: {
    layout: "padded",
  },
  args: {
    users: STORY_USERS,
    scenario: "default",
  },
  argTypes: {
    scenario: {
      control: "radio",
      options: ["default", "empty", "loading", "roles-loading"],
    },
  },
  render: (args) => <UserTableStoryShell {...args} />,
} satisfies Meta<typeof UserTableStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    scenario: "empty",
  },
};

export const Loading: Story = {
  args: {
    scenario: "loading",
  },
};

export const RolesLoading: Story = {
  args: {
    scenario: "roles-loading",
  },
};

export const ActiveRow: Story = {
  args: {
    selectedUserId: STORY_USERS[1].id,
  },
};

export const Creatable: Story = {
  args: {
    onCreateUser: fn(),
  },
};

export const Selectable: Story = {
  args: {
    onSelectUser: fn(),
  },
};
