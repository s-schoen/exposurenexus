import { createFileRoute } from "@tanstack/react-router";

import { RecordNotFound } from "@/components/not-found-state.tsx";
import { AssetDetailPage, createAssetByIDQueryOptions } from "@/features/assets";
import { AssetFindingsSection } from "@/features/findings";
import { loadRecord } from "@/lib/load-error.ts";

export const Route = createFileRoute("/_authenticated/assets/$id")({
  loader: ({ context: { queryClient }, params: { id } }) =>
    loadRecord(queryClient.ensureQueryData(createAssetByIDQueryOptions(id))),
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  // The assets feature doesn't depend on findings, so the route hands it the findings section.
  return <AssetDetailPage assetId={id} findingsSection={<AssetFindingsSection assetId={id} />} />;
}

const list = { label: "Assets", to: "/assets" };

function NotFoundComponent() {
  return <RecordNotFound noun="asset" list={list} />;
}
