import { createFileRoute } from "@tanstack/react-router";

import { CreateVulnerabilityPage } from "@/features/vulnerabilities";

export const Route = createFileRoute("/_authenticated/vulnerabilities/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateVulnerabilityPage />;
}
