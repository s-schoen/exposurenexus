import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect, useLocation } from "@tanstack/react-router";

import AppHeader from "@/components/app-header.tsx";
import { AppSidebar } from "@/components/app-sidebar.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DetailPeekContainer } from "@/components/detail-peek.tsx";
import { PageColumn, isPageColumnPath } from "@/components/page-column.tsx";
import { PageHeader } from "@/components/page-header.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { CreateAssetDialog } from "@/features/assets";
import { AccountMenu } from "@/features/auth";
import { CreateCustomFieldDialog } from "@/features/custom-fields";
import {
  CreateFindingDialog,
  createFindingStatsQueryOptions,
  getFindingNavigationCounts,
  useCreateFinding,
} from "@/features/findings";
import { CreateRoleDialog } from "@/features/roles";
import { CreateUserDialog, UserAvatar } from "@/features/users";
import { CreateVulnerabilityDialog } from "@/features/vulnerabilities";
import { usePage } from "@/hooks/use-page-meta.tsx";

function Layout() {
  const findingStats = useQuery(createFindingStatsQueryOptions());
  const { triageCount } = getFindingNavigationCounts(findingStats.data);
  const page = usePage();
  const { pathname } = useLocation();
  const inPageColumn = isPageColumnPath(pathname);
  const createFinding = useCreateFinding();

  return (
    <>
      <ConfirmDialog.Root />
      <CreateAssetDialog.Root />
      <CreateFindingDialog.Root />
      <CreateVulnerabilityDialog.Root />
      <CreateUserDialog.Root />
      <CreateRoleDialog.Root />
      <CreateCustomFieldDialog.Root />
      <Toaster />
      <SidebarProvider className="h-dvh min-h-0 flex-col overflow-hidden">
        <AppHeader
          accountMenu={
            <AccountMenu
              renderAvatar={(user) => (
                <UserAvatar userId={user?.id ?? null} user={user} size="md" decorative />
              )}
            />
          }
        />
        <div className="flex min-h-0 flex-1 px-2 pb-2">
          <div className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
            <AppSidebar
              triageCount={triageCount}
              onCreateFinding={() => {
                void createFinding();
              }}
            />
            <main className="flex min-w-0 flex-1 flex-col">
              <PageHeader {...page} titleAsHeading={!inPageColumn} />
              <DetailPeekContainer>
                {/* List pages render full-bleed rows under a sticky toolbar, without page padding. */}
                <div className="h-full overflow-y-auto p-5 has-data-full-bleed:p-0">
                  {inPageColumn ? (
                    <PageColumn>
                      <Outlet />
                    </PageColumn>
                  ) : (
                    <Outlet />
                  )}
                </div>
              </DetailPeekContainer>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const hasSession = await context.auth.ensureSession();

    if (!hasSession) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: () => <Layout />,
});
