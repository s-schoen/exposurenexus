export { AccountMenu } from "@/features/auth/components/account-menu.tsx";
export { LoginPage } from "@/features/auth/pages/login-page.tsx";
export { AuthProvider, useAuth } from "@/features/auth/providers/auth-provider.tsx";
export { AUTH_SESSION_QUERY_KEY } from "@/features/auth/queries/session.ts";
export { createRouterLoginRedirects } from "@/features/auth/routing/login-redirect.ts";
export { createUserSessionExpiredRedirectHandler } from "@/features/auth/routing/session-expiry.ts";

export type { AuthState, AuthStatus } from "@/features/auth/providers/auth-provider.tsx";
export type { AuthSessionQueryData } from "@/features/auth/queries/session.ts";
export type { LoginRedirects } from "@/features/auth/routing/login-redirect.ts";
