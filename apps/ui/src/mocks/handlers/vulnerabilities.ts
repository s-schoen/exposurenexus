import { vulnerabilityInputSchema } from "@exposurenexus/contracts/model/vulnerability";
import { delay, http } from "msw";

import { apiPath, createdAudit, newId, updatedAudit } from "@/mocks/handlers/shared.ts";
import { parseRequestBody, replyArray, replyNotFound, replyObject } from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";

export function createVulnerabilityHandlers(db: MockDb) {
  return [
    http.get(apiPath("/vulnerabilities"), async () => {
      await delay();
      return replyArray(db.vulnerabilities.all());
    }),

    http.post(apiPath("/vulnerabilities"), async ({ request }) => {
      await delay();
      const body = await parseRequestBody(request, vulnerabilityInputSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const vulnerability = { ...body.data, id: newId("vulnerability"), ...createdAudit(db) };
      db.vulnerabilities.insert(vulnerability);
      return replyObject(vulnerability, { created: true });
    }),

    http.get<{ id: string }>(apiPath("/vulnerabilities/:id"), async ({ params }) => {
      await delay();
      const vulnerability = db.vulnerabilities.get(params.id);
      return vulnerability ? replyObject(vulnerability) : replyNotFound("vulnerability");
    }),

    http.put<{ id: string }>(apiPath("/vulnerabilities/:id"), async ({ params, request }) => {
      await delay();
      const body = await parseRequestBody(request, vulnerabilityInputSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const vulnerability = db.vulnerabilities.update(params.id, {
        ...body.data,
        ...updatedAudit(db),
      });
      return vulnerability ? replyObject(vulnerability) : replyNotFound("vulnerability");
    }),

    http.delete<{ id: string }>(apiPath("/vulnerabilities/:id"), async ({ params }) => {
      await delay();
      const vulnerability = db.vulnerabilities.remove(params.id);
      if (!vulnerability) {
        return replyNotFound("vulnerability");
      }
      for (const finding of db.findings.all()) {
        db.findings.update(finding.id, {
          vulnerabilityIds: finding.vulnerabilityIds.filter((id) => id !== vulnerability.id),
        });
      }
      return replyObject(vulnerability);
    }),
  ];
}
