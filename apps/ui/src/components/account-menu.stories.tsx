import { useLayoutEffect, useMemo } from "react";

import { AccountMenu } from "@/components/account-menu.tsx";
import { AuthProvider } from "@/context/auth.tsx";
import { STORY_AUTH_SESSION, STORY_USERS } from "@/test/fixtures.ts";
import {
  RouterStoryProvider,
  createObjectResponse,
  createStoryQueryClient,
} from "@/test/storybook.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

type AccountMenuStoryArgs = {
  scenario: "authenticated" | "email-fallback" | "pending";
};

function AccountMenuStoryShell({ scenario }: AccountMenuStoryArgs) {
  const session = useMemo(
    () =>
      scenario === "email-fallback"
        ? {
            ...STORY_AUTH_SESSION,
            user: {
              ...STORY_USERS[1],
              displayName: "",
            },
          }
        : STORY_AUTH_SESSION,
    [scenario],
  );
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    if (scenario !== "pending") {
      client.setQueryData(["auth", "session"], session);
    }

    return client;
  }, [scenario, session]);

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      if (requestUrl.endsWith("/api/auth/session")) {
        if (scenario === "pending") {
          return await new Promise<Response>(() => {});
        }

        return createObjectResponse(session);
      }

      if (requestUrl.endsWith("/api/auth") && method === "DELETE") {
        return createObjectResponse({ revoked: true });
      }

      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [scenario, session]);

  return (
    <RouterStoryProvider queryClient={queryClient} initialPath="/">
      <AuthProvider>
        <AccountMenu />
      </AuthProvider>
    </RouterStoryProvider>
  );
}

const meta = {
  title: "App/Shell/AccountMenu",
  component: AccountMenuStoryShell,
  parameters: {
    layout: "centered",
  },
  args: {
    scenario: "authenticated",
  },
  argTypes: {
    scenario: {
      control: "radio",
      options: ["authenticated", "email-fallback", "pending"],
    },
  },
  render: (args) => <AccountMenuStoryShell {...args} />,
} satisfies Meta<typeof AccountMenuStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Authenticated: Story = {};

export const EmailFallback: Story = {
  args: {
    scenario: "email-fallback",
  },
};

export const Pending: Story = {
  args: {
    scenario: "pending",
  },
};
