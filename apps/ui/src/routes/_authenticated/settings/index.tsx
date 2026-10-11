import { createFileRoute, redirect } from "@tanstack/react-router";

// Settings has no overview page; it opens on its first section.
export const Route = createFileRoute("/_authenticated/settings/")({
  beforeLoad: () => {
    throw redirect({ href: "/settings/users", replace: true });
  },
});
