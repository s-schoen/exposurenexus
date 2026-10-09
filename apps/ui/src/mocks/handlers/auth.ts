import { authLoginSchema } from "@exposurenexus/contracts/api";
import { BuiltInRoleName, builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { delay, http } from "msw";

import { buildAuthSession } from "@/mocks/fixtures/builders.ts";
import { apiPath } from "@/mocks/handlers/shared.ts";
import { parseRequestBody, replyError, replyObject } from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";

export function createAuthHandlers(db: MockDb) {
  return [
    http.get(apiPath("/auth/session"), async () => {
      await delay();
      return db.session ? replyObject(db.session) : replyError(401, "Unauthorized");
    }),

    // Any password works. A known, enabled username signs in as that user, anything else as
    // the first admin.
    http.post(apiPath("/auth"), async ({ request }) => {
      await delay();
      const body = await parseRequestBody(request, authLoginSchema);
      if ("reply" in body) {
        return body.reply;
      }

      const users = db.users.all().filter((user) => user.enabled);
      const user =
        users.find((candidate) => candidate.username === body.data.username) ??
        users.find((candidate) =>
          candidate.roleIds.includes(builtInRoleIds[BuiltInRoleName.Admin]),
        );
      if (!user) {
        return replyError(401, "Unauthorized");
      }

      db.session = buildAuthSession(user, {
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      return replyObject(db.session);
    }),

    http.delete(apiPath("/auth"), async () => {
      await delay();
      const revoked = db.session !== null;
      db.session = null;
      return replyObject({ revoked });
    }),

    // Like the API: everything except the auth endpoints above needs a session. Falls through
    // to the resource handlers when signed in.
    http.all(apiPath("/*"), () => {
      if (!db.session) {
        return replyError(401, "Unauthorized");
      }
      return undefined;
    }),
  ];
}
