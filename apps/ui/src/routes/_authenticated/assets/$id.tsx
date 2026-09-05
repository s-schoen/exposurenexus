import { createFileRoute } from "@tanstack/react-router";

import { AssetDetailPage, createAssetByIDQueryOptions } from "@/features/assets";

export const Route = createFileRoute("/_authenticated/assets/$id")({
  loader: ({ context: { queryClient }, params: { id } }) =>
    queryClient.ensureQueryData(createAssetByIDQueryOptions(id)),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <AssetDetailPage assetId={id} />;
}
