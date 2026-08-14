import { createFileRoute } from "@tanstack/react-router";

import { EditCustomFieldPage } from "@/features/custom-fields/components/edit-custom-field-page.tsx";

export const Route = createFileRoute("/_authenticated/custom-fields/$id/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <EditCustomFieldPage customFieldId={id} />;
}
