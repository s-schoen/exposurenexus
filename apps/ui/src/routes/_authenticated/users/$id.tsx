import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { createListRolesQueryOptions } from "@/features/roles";
import { UserDetailPage, createUserByIDQueryOptions } from "@/features/users";

export const Route = createFileRoute("/_authenticated/users/$id")({
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
  const isEditRoute = Boolean(matchRoute({ to: "/users/$id/edit", params: { id } }));

  if (isEditRoute) {
    return <Outlet />;
  }

  return <UserDetailPage userId={id} />;
}
