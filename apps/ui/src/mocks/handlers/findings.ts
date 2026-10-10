import { createFindingSchema, updateFindingSchema } from "@exposurenexus/contracts/model/finding";
import {
  ObservationSource,
  manualObservationInputSchema,
  moveObservationInputSchema,
  updateObservationSchema,
} from "@exposurenexus/contracts/model/observation";
import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { delay, http } from "msw";

import { computeFindingStatistics, projectFinding } from "@/mocks/db.ts";
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

import type { FindingRecord, MockDb } from "@/mocks/db.ts";
import type { CreateManualFinding } from "@exposurenexus/contracts/model/finding";
import type {
  ManualObservationInput,
  Observation,
} from "@exposurenexus/contracts/model/observation";

const { Finding, Stats } = PermissionResource;
const { Read, Write, Delete } = PermissionVerb;

/** A manual observation; omitted fields fall back to the finding's values, like the API. */
function createManualObservation(
  db: MockDb,
  finding: FindingRecord,
  input: ManualObservationInput = {},
): Observation {
  const audit = createdAudit(db);
  return {
    id: newId("observation"),
    findingId: finding.id,
    title: input.title ?? finding.title,
    description: input.description ?? null,
    evidence: input.evidence ?? null,
    remediation: input.remediation ?? null,
    severity: input.severity ?? finding.severity,
    weakness: input.weakness ?? finding.weakness,
    affectedResource: input.affectedResource ?? finding.affectedResource,
    fingerprints: {},
    source: ObservationSource.Manual,
    ingestionId: null,
    observedAt: input.observedAt ?? audit.createdAt,
    ...audit,
  };
}

export function createFindingHandlers(db: MockDb) {
  const getObservation = (findingId: string, observationId: string) => {
    const observation = db.observations.get(observationId);
    return observation?.findingId === findingId ? observation : undefined;
  };
  /** Observation writes touch their finding's audit fields, like the API. */
  const touchFinding = (findingId: string) => db.findings.update(findingId, updatedAudit(db));
  /** The API's checks that a manual finding's relations exist. */
  const unknownRelation = (input: CreateManualFinding) => {
    if (!db.assets.get(input.assetId)) {
      return replyError(400, "finding asset does not exist");
    }
    if (!input.vulnerabilityIds.every((id) => db.vulnerabilities.get(id))) {
      return replyError(400, "finding vulnerability does not exist");
    }
    if (input.assigneeId && !db.users.get(input.assigneeId)) {
      return replyError(400, "finding assignee does not exist");
    }
    return undefined;
  };

  return [
    http.get(
      apiPath("/findings"),
      requirePermission(db, Finding, Read, async () => {
        await delay();
        return replyArray(db.findings.all().map((finding) => projectFinding(db, finding)));
      }),
    ),

    // Before `/findings/:id`, which would otherwise match "stats".
    http.get(
      apiPath("/findings/stats"),
      requirePermission(db, Stats, Read, async () => {
        await delay();
        return replyObject(computeFindingStatistics(db));
      }),
    ),

    // A manual finding always starts with one manual observation, `observation` or not.
    http.post(
      apiPath("/findings"),
      requirePermission(db, Finding, Write, async ({ request }) => {
        await delay();
        const body = await parseRequestBody(request, createFindingSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const rejected = unknownRelation(body.data);
        if (rejected) {
          return rejected;
        }
        const { observation, vulnerabilityIds, ...input } = body.data;
        const finding: FindingRecord = {
          ...input,
          title: input.title.trim(),
          assigneeId: input.assigneeId ?? null,
          dueDate: input.dueDate ?? null,
          mitigation: input.mitigation ?? null,
          vulnerabilityIds: [...new Set(vulnerabilityIds)],
          id: newId("finding"),
          ...createdAudit(db),
        };
        db.findings.insert(finding);
        db.observations.insert(createManualObservation(db, finding, observation));
        return replyObject(projectFinding(db, finding), { created: true });
      }),
    ),

    http.get<{ id: string }>(
      apiPath("/findings/:id"),
      requirePermission(db, Finding, Read, async ({ params }) => {
        await delay();
        const finding = db.findings.get(params.id);
        return finding
          ? replyObject(projectFinding(db, finding))
          : replyNotFound("finding", params.id);
      }),
    ),

    http.put<{ id: string }>(
      apiPath("/findings/:id"),
      requirePermission(db, Finding, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateFindingSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const finding = db.findings.update(params.id, { ...body.data, ...updatedAudit(db) });
        return finding
          ? replyObject(projectFinding(db, finding))
          : replyNotFound("finding", params.id);
      }),
    ),

    // Observations and vulnerability links cascade.
    http.delete<{ id: string }>(
      apiPath("/findings/:id"),
      requirePermission(db, Finding, Delete, async ({ params }) => {
        await delay();
        const finding = db.findings.get(params.id);
        if (!finding) {
          return replyNotFound("finding", params.id);
        }
        const projected = projectFinding(db, finding);
        db.findings.remove(finding.id);
        for (const observation of db.observations.all()) {
          if (observation.findingId === finding.id) {
            db.observations.remove(observation.id);
          }
        }
        return replyObject(projected);
      }),
    ),

    http.put<{ findingId: string; vulnerabilityId: string }>(
      apiPath("/findings/:findingId/vulnerabilities/:vulnerabilityId"),
      requirePermission(db, Finding, Write, async ({ params }) => {
        await delay();
        const finding = db.findings.get(params.findingId);
        if (!finding) {
          return replyNotFound("finding", params.findingId);
        }
        if (!db.vulnerabilities.get(params.vulnerabilityId)) {
          return replyNotFound("vulnerability", params.vulnerabilityId);
        }
        const vulnerabilityIds = finding.vulnerabilityIds.includes(params.vulnerabilityId)
          ? finding.vulnerabilityIds
          : [...finding.vulnerabilityIds, params.vulnerabilityId];
        const updated = db.findings.update(finding.id, { vulnerabilityIds, ...updatedAudit(db) })!;
        return replyObject(projectFinding(db, updated));
      }),
    ),

    http.delete<{ findingId: string; vulnerabilityId: string }>(
      apiPath("/findings/:findingId/vulnerabilities/:vulnerabilityId"),
      requirePermission(db, Finding, Write, async ({ params }) => {
        await delay();
        const finding = db.findings.get(params.findingId);
        if (!finding) {
          return replyNotFound("finding", params.findingId);
        }
        if (!db.vulnerabilities.get(params.vulnerabilityId)) {
          return replyNotFound("vulnerability", params.vulnerabilityId);
        }
        const updated = db.findings.update(finding.id, {
          vulnerabilityIds: finding.vulnerabilityIds.filter((id) => id !== params.vulnerabilityId),
          ...updatedAudit(db),
        })!;
        return replyObject(projectFinding(db, updated));
      }),
    ),

    http.get<{ findingId: string }>(
      apiPath("/findings/:findingId/observations"),
      requirePermission(db, Finding, Read, async ({ params }) => {
        await delay();
        if (!db.findings.get(params.findingId)) {
          return replyNotFound("finding", params.findingId);
        }
        return replyArray(
          db.observations.all().filter((observation) => observation.findingId === params.findingId),
        );
      }),
    ),

    http.post<{ findingId: string }>(
      apiPath("/findings/:findingId/observations"),
      requirePermission(db, Finding, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, manualObservationInputSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const finding = db.findings.get(params.findingId);
        if (!finding) {
          return replyNotFound("finding", params.findingId);
        }
        const observation = createManualObservation(db, finding, body.data);
        db.observations.insert(observation);
        touchFinding(finding.id);
        return replyObject(observation, { created: true });
      }),
    ),

    http.put<{ findingId: string; observationId: string }>(
      apiPath("/findings/:findingId/observations/:observationId"),
      requirePermission(db, Finding, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, updateObservationSchema);
        if ("reply" in body) {
          return body.reply;
        }
        if (!getObservation(params.findingId, params.observationId)) {
          return replyNotFound("observation", params.observationId);
        }
        const observation = db.observations.update(params.observationId, {
          ...body.data,
          ...updatedAudit(db),
        });
        touchFinding(params.findingId);
        return replyObject(observation!);
      }),
    ),

    http.delete<{ findingId: string; observationId: string }>(
      apiPath("/findings/:findingId/observations/:observationId"),
      requirePermission(db, Finding, Delete, async ({ params }) => {
        await delay();
        if (!getObservation(params.findingId, params.observationId)) {
          return replyNotFound("observation", params.observationId);
        }
        const observation = db.observations.remove(params.observationId)!;
        touchFinding(params.findingId);
        return replyObject(observation);
      }),
    ),

    http.post<{ findingId: string; observationId: string }>(
      apiPath("/findings/:findingId/observations/:observationId/move"),
      requirePermission(db, Finding, Write, async ({ params, request }) => {
        await delay();
        const body = await parseRequestBody(request, moveObservationInputSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const { targetFindingId } = body.data;
        if (targetFindingId === params.findingId) {
          return replyError(400, "observation already belongs to the target finding");
        }
        if (
          !getObservation(params.findingId, params.observationId) ||
          !db.findings.get(targetFindingId)
        ) {
          return replyNotFound("observation", params.observationId);
        }
        const observation = db.observations.update(params.observationId, {
          findingId: targetFindingId,
          ...updatedAudit(db),
        });
        touchFinding(params.findingId);
        touchFinding(targetFindingId);
        return replyObject(observation!);
      }),
    ),
  ];
}
