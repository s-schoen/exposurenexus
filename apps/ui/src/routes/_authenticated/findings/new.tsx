import { createFileRoute, useRouter } from "@tanstack/react-router";

import { CreateFindingPage } from "@/features/findings/components/create-finding-page.tsx";

export const Route = createFileRoute("/_authenticated/findings/new")({
  component: RouteComponent,
});

function RouteComponent() {
  const router = useRouter();

  return <CreateFindingPage onClose={() => router.history.back()} />;
}
