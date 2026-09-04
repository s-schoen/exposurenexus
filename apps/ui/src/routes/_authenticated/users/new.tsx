import { createFileRoute } from "@tanstack/react-router";

import { CreateUserPage } from "@/features/users";

export const Route = createFileRoute("/_authenticated/users/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateUserPage />;
}
