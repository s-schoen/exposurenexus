import { createFileRoute } from "@tanstack/react-router";

import { EditVulnerabilityPage } from "@/features/vulnerabilities";

export const Route = createFileRoute("/_authenticated/vulnerabilities/$id/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <EditVulnerabilityPage vulnerabilityId={id} />;
}
