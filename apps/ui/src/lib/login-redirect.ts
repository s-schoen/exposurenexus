export const DEFAULT_LOGIN_REDIRECT = "/";

interface RouteMatchLookup {
  getMatchedRoutes: (pathname: string) => [unknown, unknown, unknown | undefined];
}

interface LoginRedirectOptions {
  origin?: string;
}

interface CreateLoginRedirectOptions extends LoginRedirectOptions {
  isKnownRoutePath: (pathname: string) => boolean;
}

export interface LoginRedirects {
  safeLoginRedirect: (redirect: unknown) => string;
}

function defaultOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost";
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/login/";
}

export function createLoginRedirects({
  isKnownRoutePath,
  origin = defaultOrigin(),
}: CreateLoginRedirectOptions): LoginRedirects {
  return {
    safeLoginRedirect(redirect) {
      if (typeof redirect !== "string") {
        return DEFAULT_LOGIN_REDIRECT;
      }

      const rawRedirect = redirect.trim();
      if (!rawRedirect || rawRedirect.startsWith("//")) {
        return DEFAULT_LOGIN_REDIRECT;
      }

      let baseUrl: URL;
      let redirectUrl: URL;
      try {
        baseUrl = new URL(origin);
        redirectUrl = new URL(rawRedirect, baseUrl);
      } catch {
        return DEFAULT_LOGIN_REDIRECT;
      }

      if (!["http:", "https:"].includes(redirectUrl.protocol)) {
        return DEFAULT_LOGIN_REDIRECT;
      }

      if (redirectUrl.origin !== baseUrl.origin) {
        return DEFAULT_LOGIN_REDIRECT;
      }

      if (isLoginPath(redirectUrl.pathname)) {
        return DEFAULT_LOGIN_REDIRECT;
      }

      if (!isKnownRoutePath(redirectUrl.pathname)) {
        return DEFAULT_LOGIN_REDIRECT;
      }

      return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
    },
  };
}

export function createRouterLoginRedirects(
  router: RouteMatchLookup,
  options: LoginRedirectOptions = {},
): LoginRedirects {
  return createLoginRedirects({
    ...options,
    isKnownRoutePath: (pathname) => router.getMatchedRoutes(pathname)[2] !== undefined,
  });
}
