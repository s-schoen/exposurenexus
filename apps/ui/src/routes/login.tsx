import { createFileRoute, redirect as throwRedirect, useNavigate } from "@tanstack/react-router";

import { LoginPage } from "@/features/auth";

export const Route = createFileRoute("/login")({
  validateSearch: (search) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  beforeLoad: async ({ context, search }) => {
    const hasSession = await context.auth.ensureSession();

    if (hasSession) {
      throw throwRedirect({
        href: context.redirects.safeLoginRedirect(search.redirect),
      });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { auth, redirects } = Route.useRouteContext();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();

  return <LoginPage auth={auth} redirects={redirects} redirect={redirect} navigate={navigate} />;
}
