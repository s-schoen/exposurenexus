import { QueryClientProvider } from "@tanstack/react-query";
import { UserRoundPen } from "lucide-react";
import { useLayoutEffect, useMemo } from "react";

import { ROLE_FIXTURES } from "@/components/role-fixtures.ts";
import { STORY_USERS } from "@/components/storybook-fixtures.ts";
import {
  createArrayResponse,
  createObjectResponse,
  createStoryQueryClient,
} from "@/components/storybook-utils.tsx";
import { Button } from "@/components/ui/button.tsx";
import { UserDetailContent } from "@/components/user-detail-content.tsx";

import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { Meta, StoryObj } from "@storybook/react-vite";

type UserDetailContentStoryArgs = {
  user: UserProfile;
  scenario: "success" | "disabled" | "no-roles" | "roles-loading" | "loading" | "error";
};

const DISABLED_USER: UserProfile = {
  ...STORY_USERS[2],
  roleIds: [ROLE_FIXTURES[0].id, "11111111-1111-4111-8111-111111111111"],
};

const NO_ROLE_USER: UserProfile = {
  ...STORY_USERS[1],
  roleIds: [],
};

function UserDetailContentStoryShell({ scenario, user }: UserDetailContentStoryArgs) {
  const effectiveUser =
    scenario === "disabled" ? DISABLED_USER : scenario === "no-roles" ? NO_ROLE_USER : user;
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    if (scenario !== "loading" && scenario !== "error") {
      client.setQueryData(["users", effectiveUser.id], effectiveUser);
    }

    if (scenario !== "loading" && scenario !== "roles-loading") {
      client.setQueryData(["roles"], ROLE_FIXTURES);
    }

    return client;
  }, [effectiveUser, scenario]);

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);

      if (requestUrl.endsWith(`/api/users/${effectiveUser.id}`)) {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {});
        }

        if (scenario === "error") {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }

        return createObjectResponse(effectiveUser);
      }

      if (requestUrl.endsWith("/api/roles")) {
        if (scenario === "roles-loading") {
          return await new Promise<Response>(() => {});
        }

        return createArrayResponse(ROLE_FIXTURES);
      }

      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [effectiveUser, scenario]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-full max-w-7xl">
        <UserDetailContent
          userId={effectiveUser.id}
          titleAction={
            <Button type="button" variant="outline" size="sm">
              <UserRoundPen />
              Edit user
            </Button>
          }
        />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Resources/Users/Detail",
  component: UserDetailContentStoryShell,
  parameters: {
    layout: "padded",
  },
  args: {
    user: STORY_USERS[1],
    scenario: "success",
  },
  argTypes: {
    scenario: {
      control: "radio",
      options: ["success", "disabled", "no-roles", "roles-loading", "loading", "error"],
    },
  },
  render: (args) => <UserDetailContentStoryShell {...args} />,
} satisfies Meta<typeof UserDetailContentStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EnabledUser: Story = {};

export const DisabledUser: Story = {
  args: {
    scenario: "disabled",
  },
};

export const NoRoles: Story = {
  args: {
    scenario: "no-roles",
  },
};

export const RolesLoading: Story = {
  args: {
    scenario: "roles-loading",
  },
};

export const Loading: Story = {
  args: {
    scenario: "loading",
  },
};

export const ErrorState: Story = {
  args: {
    scenario: "error",
  },
};
