import { createFileRoute } from "@tanstack/react-router";

import { FindingDetailPage } from "@/features/findings/components/finding-detail-page.tsx";

export const Route = createFileRoute("/_authenticated/findings/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <FindingDetailPage findingId={id} />;
}
