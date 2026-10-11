import { Outlet, createFileRoute } from "@tanstack/react-router";

import { SettingsColumn } from "@/components/settings-column.tsx";

export const Route = createFileRoute("/_authenticated/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <SettingsColumn>
      <Outlet />
    </SettingsColumn>
  );
}
