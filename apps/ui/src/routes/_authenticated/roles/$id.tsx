import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { RoleDetailPage } from "@/features/roles/components/role-detail-page.tsx";

export const Route = createFileRoute("/_authenticated/roles/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const matchRoute = useMatchRoute();
  const isEditRoute = Boolean(matchRoute({ to: "/roles/$id/edit", params: { id } }));

  if (isEditRoute) {
    return <Outlet />;
  }

  return <RoleDetailPage roleId={id} />;
}
