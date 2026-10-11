import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { createListRolesQueryOptions } from "@/features/roles";
import { UserDetailPage, createUserByIDQueryOptions } from "@/features/users";

export const Route = createFileRoute("/_authenticated/settings/users/$id")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(createUserByIDQueryOptions(params.id)),
      context.queryClient.ensureQueryData(createListRolesQueryOptions()),
    ]),
  component: RouteComponent,
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
