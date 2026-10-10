import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { vulnerabilityInputSchema } from "@exposurenexus/contracts/model/vulnerability";
import { delay, http } from "msw";

import {
  apiPath,
  createdAudit,
  newId,
  requirePermission,
  updatedAudit,
} from "@/mocks/handlers/shared.ts";
import {
  parseRequestBody,
  replyArray,
  replyError,
  replyNotFound,
  replyObject,
} from "@/mocks/reply.ts";

import type { MockDb } from "@/mocks/db.ts";
import type { VulnerabilityInput } from "@exposurenexus/contracts/model/vulnerability";

const { Vulnerability } = PermissionResource;
const { Read, Write, Delete } = PermissionVerb;

export function createVulnerabilityHandlers(db: MockDb) {
  /** The API's unique (type, identifier) index. Unlike the API, identifiers aren't canonicalized. */
  const identityTaken = (input: VulnerabilityInput, id?: string) =>
    db.vulnerabilities
      .all()
      .some(
        (vulnerability) =>
          vulnerability.id !== id &&
          vulnerability.type === input.type &&
          vulnerability.identifier === input.identifier,
      );
  const identityConflict = () =>
    replyError(409, "a vulnerability with this type and identifier already exists");

  return [
    http.get(
      apiPath("/vulnerabilities"),
      requirePermission(db, Vulnerability, Read, async () => {
        await delay();
        return replyArray(db.vulnerabilities.all());
      }),
    ),

    http.post(
      apiPath("/vulnerabilities"),
      requirePermission(db, Vulnerability, Write, async ({ request }) => {
        await delay();
        const body = await parseRequestBody(request, vulnerabilityInputSchema);
        if ("reply" in body) {
          return body.reply;
        }
        if (identityTaken(body.data)) {
          return identityConflict();
        }
        const vulnerability = { ...body.data, id: newId("vulnerability"), ...createdAudit(db) };
        db.vulnerabilities.insert(vulnerability);
        return replyObject(vulnerability, { created: true });
      }),
    ),

    http.get<{ id: string }>(
      apiPath("/vulnerabilities/:id"),
      requirePermission(db, Vulnerability, Read, async ({ params }) => {
        await delay();
        const vulnerability = db.vulnerabilities.get(params.id);
        return vulnerability
          ? replyObject(vulnerability)
          : replyNotFound("vulnerability", params.id);
      }),
    ),

    http.put<{ id: string }>(
      apiPath("/vulnerabilities/:id"),
      requirePermission(db, Vulnerability, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, vulnerabilityInputSchema);
        if ("reply" in body) {
          return body.reply;
        }
        if (!db.vulnerabilities.get(params.id)) {
          return replyNotFound("vulnerability", params.id);
        }
        if (identityTaken(body.data, params.id)) {
          return identityConflict();
        }
        const vulnerability = db.vulnerabilities.update(params.id, {
          ...body.data,
          ...updatedAudit(db),
        });
        return replyObject(vulnerability!);
      }),
    ),

    // Links to findings cascade: the findings stay, without this vulnerability.
    http.delete<{ id: string }>(
      apiPath("/vulnerabilities/:id"),
      requirePermission(db, Vulnerability, Delete, async ({ params }) => {
        await delay();
        const vulnerability = db.vulnerabilities.remove(params.id);
        if (!vulnerability) {
          return replyNotFound("vulnerability", params.id);
        }
        for (const finding of db.findings.all()) {
          db.findings.update(finding.id, {
            vulnerabilityIds: finding.vulnerabilityIds.filter((id) => id !== vulnerability.id),
          });
        }
        return replyObject(vulnerability);
      }),
    ),
  ];
}
