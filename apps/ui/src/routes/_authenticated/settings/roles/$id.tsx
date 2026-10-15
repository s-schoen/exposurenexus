import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { RecordNotFound } from "@/components/not-found-state.tsx";
import { RoleDetailPage, createRoleByIDQueryOptions } from "@/features/roles";
import { loadRecord } from "@/lib/load-error.ts";

export const Route = createFileRoute("/_authenticated/settings/roles/$id")({
  loader: ({ context, params }) =>
    loadRecord(context.queryClient.ensureQueryData(createRoleByIDQueryOptions(params.id))),
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const matchRoute = useMatchRoute();
  const isEditRoute = Boolean(matchRoute({ to: "/settings/roles/$id/edit", params: { id } }));

  if (isEditRoute) {
    return <Outlet />;
  }

  return <RoleDetailPage roleId={id} />;
}

const list = { label: "Roles", to: "/settings/roles" };

function NotFoundComponent() {
  return <RecordNotFound noun="role" list={list} />;
}
