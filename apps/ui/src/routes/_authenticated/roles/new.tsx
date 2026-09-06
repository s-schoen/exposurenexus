import { createFileRoute } from "@tanstack/react-router";

import { CreateRolePage, createListRolesQueryOptions } from "@/features/roles";

export const Route = createFileRoute("/_authenticated/roles/new")({
  loader: ({ context }) => context.queryClient.ensureQueryData(createListRolesQueryOptions()),
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateRolePage />;
}
