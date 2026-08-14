import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

import AppHeader from "@/components/app-header.tsx";
import { AppSidebar } from "@/components/app-sidebar.tsx";
import { AssetDialog } from "@/components/asset-dialog.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { usePage } from "@/context/page.tsx";
import { cn } from "@/lib/utils.ts";

function Layout() {
  const { title, description, actions } = usePage();

  return (
    <>
      <ConfirmDialog.Root />
      <AssetDialog.Root />
      <Toaster />
      <SidebarProvider className="flex-col">
        <div className="flex h-dvh w-full flex-col overflow-hidden antialiased">
          <header className="shrink-0">
            <AppHeader />
          </header>
          <div className="flex flex-1 overflow-hidden">
            <AppSidebar />
            <SidebarInset className="m-0 w-auto min-w-0 overflow-hidden bg-transparent shadow-none md:ml-0 md:rounded-[1.75rem] md:border md:border-shell-border-strong/70 md:bg-(--color-shell-panel) md:shadow-(--shell-shadow)">
              <main className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
                  <section className="rounded-3xl border border-border/70 bg-shell-panel-strong/90 p-4 shadow-sm sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="space-y-1">
                          <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">
                            {title}
                          </h1>
                          {description && (
                            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                              {description}
                            </p>
                          )}
                        </div>
                      </div>
                      {actions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          {actions.map((action, index) => (
                            <Button
                              key={action.label}
                              variant={
                                index === 0
                                  ? (action.variant ?? "default")
                                  : (action.variant ?? "outline")
                              }
                              size="sm"
                              className={cn(
                                "rounded-xl",
                                index === 0 && "shadow-sm shadow-primary/20",
                              )}
                              disabled={action.disabled}
                              onClick={action.onClick}
                            >
                              {action.icon && <action.icon />}
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                  <div className="mt-5">
                    <NuqsAdapter>
                      <Outlet />
                    </NuqsAdapter>
                  </div>
                </div>
              </main>
            </SidebarInset>
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
