import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { AppSidebar } from "@/components/AppSidebar.tsx"
import { SidebarProvider } from "@/components/ui/sidebar.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const hasSession = await context.auth.ensureSession()

    if (!hasSession) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href }
      })
    }
  },
  component: () => (
    <>
      <Toaster />
      <SidebarProvider>
        <AppSidebar />
        <main className="flex-1">
          <div className="flex p-4 flex-col h-screen">
            <Outlet />
          </div>
        </main>
      </SidebarProvider>
    </>
  )
})
