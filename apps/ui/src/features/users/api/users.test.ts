import { describe, expect, it } from "vitest";

import { createUser, getUserByID, listUsers, updateUser } from "@/features/users/api/users.ts";
import { APIError } from "@/lib/api-client.ts";
import { SEED_USERS } from "@/mocks/fixtures/index.ts";
import { mockApiError, mockApiReply } from "@/test/msw.ts";

// Happy-path requests and bodies are covered by src/mocks/handlers/handlers.test.ts, whose
// handlers validate bodies with the contracts schemas. This covers error and reply handling.

const [, user] = SEED_USERS;
const { id: _, ...profile } = user;
const { username: __, ...update } = profile;

describe("user api", () => {
  it.each([
    ["list", "get", "/users", () => listUsers()],
    ["get", "get", "/users/:id", () => getUserByID(user.id)],
    ["create", "post", "/users", () => createUser({ ...profile, password: "secret" })],
    ["update", "put", "/users/:id", () => updateUser(user.id, update)],
  ] as const)("turns %s error replies into APIErrors", async (_name, method, path, call) => {
    mockApiError(method, path, 422, "User endpoint rejected the request", "user-reason");

    const request = call();
    await expect(request).rejects.toBeInstanceOf(APIError);
    await expect(request).rejects.toMatchObject({
      statusCode: 422,
      message: "User endpoint rejected the request",
      reason: "user-reason",
    });
  });

  it("rejects replies that break the user contract", async () => {
    mockApiReply("get", "/users", { data: { items: [{ ...user, email: "not-an-email" }] } });

    await expect(listUsers()).rejects.toThrow();
  });
});
