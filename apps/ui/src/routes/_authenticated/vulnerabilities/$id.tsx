import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { RecordNotFound } from "@/components/not-found-state.tsx";
import {
  createVulnerabilityByIDQueryOptions,
  VulnerabilityDetailPage,
} from "@/features/vulnerabilities";
import { loadRecord } from "@/lib/load-error.ts";

export const Route = createFileRoute("/_authenticated/vulnerabilities/$id")({
  loader: ({ context, params }) =>
    loadRecord(context.queryClient.ensureQueryData(createVulnerabilityByIDQueryOptions(params.id))),
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
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

const list = { label: "Vulnerabilities", to: "/vulnerabilities" };

function NotFoundComponent() {
  return <RecordNotFound noun="vulnerability" list={list} />;
}
