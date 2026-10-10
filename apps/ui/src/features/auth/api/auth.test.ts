import { describe, expect, it, vi } from "vitest";

import { getSession, signIn, signOut } from "@/features/auth/api/auth.ts";
import { SEED_AUTH_SESSION, SEED_USERS } from "@/mocks/fixtures/index.ts";
import { captureApiCalls, db, recordApiRequests, seedScenario } from "@/test/msw.ts";

const [, MORGAN] = SEED_USERS;

describe("auth API", () => {
  it("trims the username, keeps the password and sends no CSRF token", async () => {
    seedScenario("loggedOut");
    const calls = captureApiCalls("post", "/auth");

    const { data } = await signIn.username({
      username: ` ${MORGAN.username} `,
      password: " correct-horse-battery-staple ",
    });

    expect(data.user).toEqual(MORGAN);
    expect(calls[0].body).toEqual({
      username: MORGAN.username,
      password: " correct-horse-battery-staple ",
    });
    expect(calls[0].headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].headers.get("X-CSRF-Token")).toBeNull();
  });

  it.each(["", "   ", "\t\n "])(
    "rejects blank username %j before any request",
    async (username) => {
      const requests = recordApiRequests();

      await expect(signIn.username({ username, password: "secret" })).rejects.toThrow();
      expect(requests).toEqual([]);
    },
  );

  it("loads the current session and surfaces a missing one as a 401", async () => {
    await expect(getSession()).resolves.toEqual({ data: SEED_AUTH_SESSION });

    seedScenario("loggedOut");
    await expect(getSession()).rejects.toMatchObject({ statusCode: 401, message: "Unauthorized" });
  });

  it("signs out with the CSRF token from its cookie", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-exposurenexus-csrf=csrf-token");
    const calls = captureApiCalls("delete", "/auth");
    const onSuccess = vi.fn();

    await expect(signOut({ fetchOptions: { onSuccess } })).resolves.toEqual({
      data: { revoked: true },
    });

    expect(calls[0].headers.get("X-CSRF-Token")).toBe("csrf-token");
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(db.session).toBeNull();
  });
});
