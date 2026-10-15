import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { RecordNotFound } from "@/components/not-found-state.tsx";
import {
  CustomFieldDetailPage,
  createAssetCustomFieldDefinitionByIDQueryOptions,
} from "@/features/custom-fields";
import { loadRecord } from "@/lib/load-error.ts";

export const Route = createFileRoute("/_authenticated/settings/custom-fields/$id")({
  loader: ({ context: { queryClient }, params: { id } }) =>
    loadRecord(queryClient.ensureQueryData(createAssetCustomFieldDefinitionByIDQueryOptions(id))),
  component: RouteComponent,
  notFoundComponent: NotFoundComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const matchRoute = useMatchRoute();
  const isEditRoute = Boolean(
    matchRoute({ to: "/settings/custom-fields/$id/edit", params: { id } }),
  );

  if (isEditRoute) {
    return <Outlet />;
  }

  return <CustomFieldDetailPage customFieldId={id} />;
}

const list = { label: "Custom fields", to: "/settings/custom-fields" };

function NotFoundComponent() {
  return <RecordNotFound noun="custom field" list={list} />;
}
