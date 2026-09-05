import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import {
  CustomFieldDetailPage,
  createAssetCustomFieldDefinitionByIDQueryOptions,
} from "@/features/custom-fields";

export const Route = createFileRoute("/_authenticated/custom-fields/$id")({
  loader: ({ context: { queryClient }, params: { id } }) =>
    queryClient.ensureQueryData(createAssetCustomFieldDefinitionByIDQueryOptions(id)),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const matchRoute = useMatchRoute();
  const isEditRoute = Boolean(matchRoute({ to: "/custom-fields/$id/edit", params: { id } }));

  if (isEditRoute) {
    return <Outlet />;
  }

  return <CustomFieldDetailPage customFieldId={id} />;
}
