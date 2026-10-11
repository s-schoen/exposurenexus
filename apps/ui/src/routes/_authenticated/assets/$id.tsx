import { createFileRoute } from "@tanstack/react-router";

import { AssetDetailPage, createAssetByIDQueryOptions } from "@/features/assets";
import { AssetFindingsSection } from "@/features/findings";

export const Route = createFileRoute("/_authenticated/assets/$id")({
  loader: ({ context: { queryClient }, params: { id } }) =>
    queryClient.ensureQueryData(createAssetByIDQueryOptions(id)),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  // The assets feature doesn't depend on findings, so the route hands it the findings section.
  return <AssetDetailPage assetId={id} findingsSection={<AssetFindingsSection assetId={id} />} />;
}
