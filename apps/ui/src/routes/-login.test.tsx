import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    ensureSession: vi.fn(),
    login: vi.fn(),
  },
  redirects: {
    safeLoginRedirect: vi.fn((redirect: unknown) =>
      typeof redirect === "string" ? redirect : "/",
    ),
  },
  navigate: vi.fn(),
  redirect: "/findings",
  redirectResult: vi.fn((options: unknown) => ({
    redirect: true,
    options,
  })),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
      useNavigate: () => mocks.navigate,
      useRouteContext: () => ({
        auth: mocks.auth,
        redirects: mocks.redirects,
      }),
      useSearch: () => ({
        redirect: mocks.redirect,
      }),
    }),
    redirect: mocks.redirectResult,
    useNavigate: () => mocks.navigate,
  });
});

describe("login route", () => {
  beforeEach(() => {
    mocks.auth.ensureSession.mockReset();
    mocks.auth.ensureSession.mockResolvedValue(false);
    mocks.auth.login.mockReset();
    mocks.redirects.safeLoginRedirect.mockReset();
    mocks.redirects.safeLoginRedirect.mockImplementation((redirect: unknown) =>
      typeof redirect === "string" ? redirect : "/",
    );
    mocks.navigate.mockReset();
    mocks.redirect = "/findings";
    mocks.redirectResult.mockClear();
  });

  it("defaults the redirect search value and redirects authenticated users", async () => {
    const { Route } = await import("@/routes/login.tsx");

    expect(
      (
        Route.options.validateSearch as (search: Record<string, unknown>) => {
          redirect: string;
        }
      )({}),
    ).toEqual({ redirect: "/" });
    expect(
      (
        Route.options.validateSearch as (search: Record<string, unknown>) => {
          redirect: string;
        }
      )({ redirect: "/assets" }),
    ).toEqual({ redirect: "/assets" });
    expect(
      (
        Route.options.validateSearch as (search: Record<string, unknown>) => {
          redirect: string;
        }
      )({ redirect: 42 }),
    ).toEqual({ redirect: "/" });

    mocks.auth.ensureSession.mockResolvedValueOnce(true);
    await expect(
      (
        Route.options.beforeLoad as (args: {
          context: {
            auth: { ensureSession: () => Promise<boolean> };
            redirects: { safeLoginRedirect: (redirect: unknown) => string };
          };
          search: { redirect: string };
        }) => Promise<void>
      )({
        context: {
          auth: {
            ensureSession: mocks.auth.ensureSession,
          },
          redirects: mocks.redirects,
        },
        search: {
          redirect: "/assets",
        },
      }),
    ).rejects.toEqual({
      options: { href: "/assets" },
      redirect: true,
    });
    expect(mocks.auth.ensureSession).toHaveBeenCalledTimes(1);
    expect(mocks.redirects.safeLoginRedirect).toHaveBeenCalledWith("/assets");
    expect(mocks.redirectResult).toHaveBeenCalledWith({ href: "/assets" });
  });

  it("allows unauthenticated users to load the login page", async () => {
    const { Route } = await import("@/routes/login.tsx");

    await expect(
      (
        Route.options.beforeLoad as (args: {
          context: {
            auth: { ensureSession: () => Promise<boolean> };
            redirects: { safeLoginRedirect: (redirect: unknown) => string };
          };
          search: { redirect: string };
        }) => Promise<void>
      )({
        context: {
          auth: {
            ensureSession: mocks.auth.ensureSession,
          },
          redirects: mocks.redirects,
        },
        search: {
          redirect: "/assets",
        },
      }),
    ).resolves.toBeUndefined();
    expect(mocks.auth.ensureSession).toHaveBeenCalledTimes(1);
    expect(mocks.redirectResult).not.toHaveBeenCalled();
  });
});
