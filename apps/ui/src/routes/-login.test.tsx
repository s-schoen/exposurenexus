import { describe, expect, it } from "vitest";

import { Route } from "@/routes/login.tsx";

// Sign-in and redirects through this route are covered by features/auth/auth.app.test.tsx.

const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => {
  redirect: string;
};

describe("login route search", () => {
  it("defaults the redirect to the home page", () => {
    expect(validateSearch({})).toEqual({ redirect: "/" });
    expect(validateSearch({ redirect: 42 })).toEqual({ redirect: "/" });
    expect(validateSearch({ redirect: "/assets" })).toEqual({ redirect: "/assets" });
  });
});
