import { createFileRoute } from "@tanstack/react-router";

import { EditCustomFieldPage } from "@/features/custom-fields";

export const Route = createFileRoute("/_authenticated/custom-fields/$id/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <EditCustomFieldPage customFieldId={id} />;
}
