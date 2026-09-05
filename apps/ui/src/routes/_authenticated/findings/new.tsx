import { createFileRoute, useRouter } from "@tanstack/react-router";

import { createListAssetsQueryOptions } from "@/features/assets";
import { CreateFindingPage } from "@/features/findings";
import { createListUsersQueryOptions } from "@/features/users";

export const Route = createFileRoute("/_authenticated/findings/new")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(createListAssetsQueryOptions()),
      queryClient.ensureQueryData(createListUsersQueryOptions()),
    ]),
  component: RouteComponent,
});

function RouteComponent() {
  const router = useRouter();

  return <CreateFindingPage onClose={() => router.history.back()} />;
}
