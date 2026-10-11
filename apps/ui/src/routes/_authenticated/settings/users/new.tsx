import { createFileRoute } from "@tanstack/react-router";

import { createListRolesQueryOptions } from "@/features/roles";
import { CreateUserPage } from "@/features/users";

export const Route = createFileRoute("/_authenticated/settings/users/new")({
  loader: ({ context }) => context.queryClient.ensureQueryData(createListRolesQueryOptions()),
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateUserPage />;
}
