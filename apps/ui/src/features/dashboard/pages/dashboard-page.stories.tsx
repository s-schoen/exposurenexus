import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { useMemo } from "react";

import { DashboardPage } from "@/features/dashboard/pages/dashboard-page.tsx";
import { PageProvider } from "@/hooks/use-page-meta.tsx";
import { RouterStoryProvider, createStoryQueryClient } from "@/test/storybook.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

const assetId = "447b53a7-c4e7-4b4e-a3b2-123456789abc";
const actorId = "8f5f4c3b-c369-481d-98f7-cf7148d80d21";

function DashboardPageStoryShell() {
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    client.setQueryData(
      ["assets"],
      [
        {
          id: assetId,
          displayName: "edge-gateway",
          type: AssetType.Host,
          environment: AssetEnvironment.Production,
          lifecycleState: AssetLifecycleState.Active,
          ownerId: actorId,
          identifiers: [],
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-08-17T00:00:00.000Z"),
          createdBy: actorId,
          updatedBy: actorId,
        },
      ],
    );
    client.setQueryData(["findings", "stats"], {
      total: 10,
      status: {
        [FindingStatus.Active]: 3,
        [FindingStatus.Inactive]: 1,
        [FindingStatus.Confirmed]: 2,
        [FindingStatus.FalsePositive]: 0,
        [FindingStatus.RiskAccepted]: 0,
        [FindingStatus.Duplicate]: 0,
        [FindingStatus.OutOfScope]: 0,
        [FindingStatus.Mitigated]: 4,
      },
      severity: {
        [VulnerabilitySeverity.Info]: 0,
        [VulnerabilitySeverity.Low]: 1,
        [VulnerabilitySeverity.Medium]: 6,
        [VulnerabilitySeverity.High]: 2,
        [VulnerabilitySeverity.Critical]: 1,
      },
      assets: { [assetId]: 5 },
    });

    return client;
  }, []);

  return (
    <RouterStoryProvider queryClient={queryClient} initialPath="/">
      <PageProvider>
        <DashboardPage />
      </PageProvider>
    </RouterStoryProvider>
  );
}

const meta = {
  title: "Features/Dashboard/DashboardPage",
  component: DashboardPageStoryShell,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof DashboardPageStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FindingCentricOverview: Story = {};
