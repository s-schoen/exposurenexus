import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import {
  createVulnerabilityByIDQueryOptions,
  VulnerabilityDetailPage,
} from "@/features/vulnerabilities";

export const Route = createFileRoute("/_authenticated/vulnerabilities/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(createVulnerabilityByIDQueryOptions(params.id)),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const matchRoute = useMatchRoute();
  const isEditRoute = Boolean(
    matchRoute({
      to: "/vulnerabilities/$id/edit",
      params: { id },
    }),
  );

  if (isEditRoute) {
    return <Outlet />;
  }

  return <VulnerabilityDetailPage vulnerabilityId={id} />;
}
