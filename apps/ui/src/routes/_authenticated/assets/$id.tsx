import { createFileRoute } from "@tanstack/react-router";

import { AssetDetailPage } from "@/features/assets";

export const Route = createFileRoute("/_authenticated/assets/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <AssetDetailPage assetId={id} />;
}
