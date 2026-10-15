import { createFileRoute } from "@tanstack/react-router";

import { RecordNotFound } from "@/components/not-found-state.tsx";
import { createAssetByIDQueryOptions } from "@/features/assets";
import { createFindingByIDQueryOptions, FindingDetailPage } from "@/features/findings";
import { loadRecord } from "@/lib/load-error.ts";

export const Route = createFileRoute("/_authenticated/findings/$id")({
  loader: async ({ context: { queryClient }, params: { id } }) => {
    const finding = await loadRecord(
      queryClient.ensureQueryData(createFindingByIDQueryOptions(id)),
    );
    await queryClient.ensureQueryData(createAssetByIDQueryOptions(finding.assetId));
  },
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <FindingDetailPage findingId={id} />;
}

const list = { label: "Findings", to: "/findings" };

function NotFoundComponent() {
  return <RecordNotFound noun="finding" list={list} />;
}
