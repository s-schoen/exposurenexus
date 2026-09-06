import { createFileRoute } from "@tanstack/react-router";

import { createListAssetsQueryOptions } from "@/features/assets";
import { DashboardPage } from "@/features/dashboard";
import { createFindingStatsQueryOptions } from "@/features/findings";

export const Route = createFileRoute("/_authenticated/")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(createListAssetsQueryOptions()),
      queryClient.ensureQueryData(createFindingStatsQueryOptions()),
    ]),
  component: RouteComponent,
});

function RouteComponent() {
  return <DashboardPage />;
}
