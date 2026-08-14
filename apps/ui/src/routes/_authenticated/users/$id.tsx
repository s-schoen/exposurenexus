import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { UserDetailPage } from "@/features/users/components/user-detail-page.tsx";

export const Route = createFileRoute("/_authenticated/users/$id")({
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
