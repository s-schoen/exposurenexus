import { createFileRoute } from "@tanstack/react-router";

import { createAssetByIDQueryOptions } from "@/features/assets";
import { createFindingByIDQueryOptions, FindingDetailPage } from "@/features/findings";

export const Route = createFileRoute("/_authenticated/findings/$id")({
  loader: async ({ context: { queryClient }, params: { id } }) => {
    const finding = await queryClient.ensureQueryData(createFindingByIDQueryOptions(id));
    await queryClient.ensureQueryData(createAssetByIDQueryOptions(finding.assetId));
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <FindingDetailPage findingId={id} />;
}
