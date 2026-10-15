import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { RecordNotFound } from "@/components/not-found-state.tsx";
import { createListRolesQueryOptions } from "@/features/roles";
import { UserDetailPage, createUserByIDQueryOptions } from "@/features/users";
import { loadRecord } from "@/lib/load-error.ts";

export const Route = createFileRoute("/_authenticated/settings/users/$id")({
  loader: ({ context, params }) =>
    Promise.all([
      loadRecord(context.queryClient.ensureQueryData(createUserByIDQueryOptions(params.id))),
      context.queryClient.ensureQueryData(createListRolesQueryOptions()),
    ]),
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  const matchRoute = useMatchRoute();
  const isEditRoute = Boolean(matchRoute({ to: "/settings/users/$id/edit", params: { id } }));

  if (isEditRoute) {
    return <Outlet />;
  }

  return <UserDetailPage userId={id} />;
}

const list = { label: "Users", to: "/settings/users" };

function NotFoundComponent() {
  return <RecordNotFound noun="user" list={list} />;
}
