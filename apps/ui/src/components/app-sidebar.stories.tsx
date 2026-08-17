import { FindingStatus } from "@exposurenexus/types/model/finding";
import { useLayoutEffect, useMemo, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar.tsx";
import {
  RouterStoryProvider,
  createObjectResponse,
  createStoryQueryClient,
} from "@/components/storybook-utils.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

type AppSidebarStoryArgs = {
  initialPath: string;
  activeFindings: number;
  confirmedFindings: number;
};

function AppSidebarStoryShell({
  activeFindings,
  confirmedFindings,
  initialPath,
}: AppSidebarStoryArgs) {
  const stats = useMemo(
    () => ({
      total: activeFindings + confirmedFindings,
      status: {
        [FindingStatus.Active]: activeFindings,
        [FindingStatus.Confirmed]: confirmedFindings,
      },
      severity: {},
      assets: {},
    }),
    [activeFindings, confirmedFindings],
  );
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    client.setQueryData(["findings", "stats"], stats);

    return client;
  }, [stats]);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);

      if (requestUrl.endsWith("/api/findings/stats")) {
        return createObjectResponse(stats);
      }

      return originalFetch(input, init);
    };

    setReady(true);

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [stats]);

  if (!ready) {
    return null;
  }

  return (
    <RouterStoryProvider queryClient={queryClient} initialPath={initialPath}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </RouterStoryProvider>
  );
}

const meta = {
  title: "App/Shell/Sidebar",
  component: AppSidebarStoryShell,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    initialPath: "/findings/triage",
    activeFindings: 7,
    confirmedFindings: 3,
  },
  render: (args) => <AppSidebarStoryShell {...args} />,
} satisfies Meta<typeof AppSidebarStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TriageActive: Story = {};

export const AssetsActive: Story = {
  args: {
    initialPath: "/assets/447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  },
};

export const WithoutBadges: Story = {
  args: {
    activeFindings: 0,
    confirmedFindings: 0,
  },
};
