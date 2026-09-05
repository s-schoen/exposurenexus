import { QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useMemo } from "react";

import { UserPreview } from "@/features/users/components/user-preview.tsx";
import { ROLE_FIXTURES, STORY_USERS } from "@/test/fixtures.ts";
import {
  createArrayResponse,
  createObjectResponse,
  createStoryQueryClient,
} from "@/test/storybook.tsx";

import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { Meta, StoryObj } from "@storybook/react-vite";

type UserPreviewStoryArgs = {
  user: UserProfile;
  scenario:
    | "success"
    | "disabled"
    | "no-roles"
    | "roles-loading"
    | "roles-error"
    | "loading"
    | "error";
};

const DISABLED_USER: UserProfile = {
  ...STORY_USERS[2],
  roleIds: [ROLE_FIXTURES[0].id, "11111111-1111-4111-8111-111111111111"],
};

const NO_ROLE_USER: UserProfile = {
  ...STORY_USERS[1],
  roleIds: [],
};

function UserPreviewStoryShell({ scenario, user }: UserPreviewStoryArgs) {
  const effectiveUser =
    scenario === "disabled" ? DISABLED_USER : scenario === "no-roles" ? NO_ROLE_USER : user;
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    if (scenario !== "loading" && scenario !== "error") {
      client.setQueryData(["users", effectiveUser.id], effectiveUser);
    }

    if (scenario !== "loading" && scenario !== "roles-loading" && scenario !== "roles-error") {
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

        if (scenario === "roles-error") {
          return new Response(JSON.stringify({ error: "Roles request failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
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
        <UserPreview userId={effectiveUser.id} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Resources/Users/Preview",
  component: UserPreviewStoryShell,
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
      options: [
        "success",
        "disabled",
        "no-roles",
        "roles-loading",
        "roles-error",
        "loading",
        "error",
      ],
    },
  },
  render: (args) => <UserPreviewStoryShell {...args} />,
} satisfies Meta<typeof UserPreviewStoryShell>;

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

export const RolesError: Story = { args: { scenario: "roles-error" } };
