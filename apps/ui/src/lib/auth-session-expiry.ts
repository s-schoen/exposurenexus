import type { UnauthorizedAPIErrorEvent } from "@/lib/query-client.ts";

type UserSessionExpiredHandler = (event: UnauthorizedAPIErrorEvent) => void;

interface SessionExpiryLocation {
  href: string;
  pathname: string;
}

interface UserSessionExpiredRedirectOptions {
  clearSession: () => void;
  getLocation: () => SessionExpiryLocation;
  navigateToLogin: (redirect: string) => Promise<void>;
  safeLoginRedirect: (redirect: unknown) => string;
}

export function createUserSessionExpiredRedirectHandler({
  clearSession,
  getLocation,
  navigateToLogin,
  safeLoginRedirect,
}: UserSessionExpiredRedirectOptions): UserSessionExpiredHandler {
  let redirectInFlight = false;

  return () => {
    clearSession();

    const currentLocation = getLocation();
    if (redirectInFlight || currentLocation.pathname === "/login") {
      return;
    }

    redirectInFlight = true;
    void Promise.resolve(navigateToLogin(safeLoginRedirect(currentLocation.href))).finally(() => {
      redirectInFlight = false;
    });
  };
}
