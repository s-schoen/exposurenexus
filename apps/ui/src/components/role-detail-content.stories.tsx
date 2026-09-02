import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useMemo } from "react";

import { RoleDetailContent } from "@/components/role-detail-content";
import { BUILT_IN_ADMIN_ROLE, CUSTOM_AUDITOR_ROLE } from "@/test/fixtures.ts";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { Meta, StoryObj } from "@storybook/react-vite";

type RoleDetailStoryArgs = {
  roleId: string;
  role: Role;
  scenario: "success" | "loading" | "error";
};

function RoleDetailContentStoryShell({ roleId, role, scenario }: RoleDetailStoryArgs) {
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        },
      },
    });

    if (scenario === "success") {
      client.setQueryData(["roles", roleId], role);
    }

    return client;
  }, [role, roleId, scenario]);

  useLayoutEffect(() => {
    if (scenario === "success") {
      return;
    }

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);

      if (!requestUrl.endsWith(`/api/roles/${roleId}`)) {
        return originalFetch(input, init);
      }

      if (scenario === "loading") {
        return await new Promise<Response>(() => {});
      }

      return new Response(JSON.stringify({ error: "Role request failed" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      });
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [roleId, scenario]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-full max-w-6xl">
        <RoleDetailContent roleId={roleId} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Resources/Roles/Detail",
  component: RoleDetailContentStoryShell,
  parameters: {
    layout: "padded",
  },
  args: {
    roleId: BUILT_IN_ADMIN_ROLE.id,
    role: BUILT_IN_ADMIN_ROLE,
    scenario: "success",
  },
  render: (args) => <RoleDetailContentStoryShell {...args} />,
} satisfies Meta<typeof RoleDetailContentStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BuiltInAdmin: Story = {};

export const CustomRole: Story = {
  args: {
    roleId: CUSTOM_AUDITOR_ROLE.id,
    role: CUSTOM_AUDITOR_ROLE,
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
