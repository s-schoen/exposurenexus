import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";

import { SettingsColumn, isSettingsColumnPath } from "@/components/settings-column.tsx";

export const Route = createFileRoute("/_authenticated/settings")({
  component: RouteComponent,
});

function RouteComponent() {
  const { pathname } = useLocation();

  if (!isSettingsColumnPath(pathname)) {
    return <Outlet />;
  }

  return (
    <SettingsColumn>
      <Outlet />
    </SettingsColumn>
  );
}
