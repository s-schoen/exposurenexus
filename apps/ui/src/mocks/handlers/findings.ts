import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { createFindingSchema, updateFindingSchema } from "@exposurenexus/contracts/model/finding";
import {
  ObservationSource,
  manualObservationInputSchema,
  moveObservationInputSchema,
  updateObservationSchema,
} from "@exposurenexus/contracts/model/observation";
import { delay, http } from "msw";

import { computeFindingStatistics, projectFinding } from "@/mocks/db.ts";
import { apiPath, createdAudit, newId, updatedAudit } from "@/mocks/handlers/shared.ts";
import { parseRequestBody, replyArray, replyNotFound, replyObject } from "@/mocks/reply.ts";

import type { FindingRecord, MockDb } from "@/mocks/db.ts";
import type {
  ManualObservationInput,
  Observation,
} from "@exposurenexus/contracts/model/observation";

/** A manual observation; omitted fields fall back to the finding's values. */
function createManualObservation(
  db: MockDb,
  finding: FindingRecord,
  input: ManualObservationInput,
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
    affectedResource: input.affectedResource ?? { type: AffectedResourceType.Unspecified },
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

  return [
    http.get(apiPath("/findings"), async () => {
      await delay();
      return replyArray(db.findings.all().map((finding) => projectFinding(db, finding)));
    }),

    // Before `/findings/:id`, which would otherwise match "stats".
    http.get(apiPath("/findings/stats"), async () => {
      await delay();
      return replyObject(computeFindingStatistics(db));
    }),

    http.post(apiPath("/findings"), async ({ request }) => {
      await delay();
      const body = await parseRequestBody(request, createFindingSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const { observation, ...input } = body.data;
      const finding: FindingRecord = { ...input, id: newId("finding"), ...createdAudit(db) };
      db.findings.insert(finding);
      if (observation) {
        db.observations.insert(createManualObservation(db, finding, observation));
      }
      return replyObject(projectFinding(db, finding), { created: true });
    }),

    http.get<{ id: string }>(apiPath("/findings/:id"), async ({ params }) => {
      await delay();
      const finding = db.findings.get(params.id);
      return finding ? replyObject(projectFinding(db, finding)) : replyNotFound("finding");
    }),

    http.put<{ id: string }>(apiPath("/findings/:id"), async ({ params, request }) => {
      await delay();
      const body = await parseRequestBody(request, updateFindingSchema);
      if ("reply" in body) {
        return body.reply;
      }
      const finding = db.findings.update(params.id, { ...body.data, ...updatedAudit(db) });
      return finding ? replyObject(projectFinding(db, finding)) : replyNotFound("finding");
    }),

    http.delete<{ id: string }>(apiPath("/findings/:id"), async ({ params }) => {
      await delay();
      const finding = db.findings.get(params.id);
      if (!finding) {
        return replyNotFound("finding");
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

    http.put<{ id: string; vulnerabilityId: string }>(
      apiPath("/findings/:id/vulnerabilities/:vulnerabilityId"),
      async ({ params }) => {
        await delay();
        const finding = db.findings.get(params.id);
        if (!finding) {
          return replyNotFound("finding");
        }
        if (!db.vulnerabilities.get(params.vulnerabilityId)) {
          return replyNotFound("vulnerability");
        }
        const vulnerabilityIds = finding.vulnerabilityIds.includes(params.vulnerabilityId)
          ? finding.vulnerabilityIds
          : [...finding.vulnerabilityIds, params.vulnerabilityId];
        const updated = db.findings.update(finding.id, { vulnerabilityIds, ...updatedAudit(db) })!;
        return replyObject(projectFinding(db, updated));
      },
    ),

    http.delete<{ id: string; vulnerabilityId: string }>(
      apiPath("/findings/:id/vulnerabilities/:vulnerabilityId"),
      async ({ params }) => {
        await delay();
        const finding = db.findings.get(params.id);
        if (!finding) {
          return replyNotFound("finding");
        }
        const updated = db.findings.update(finding.id, {
          vulnerabilityIds: finding.vulnerabilityIds.filter((id) => id !== params.vulnerabilityId),
          ...updatedAudit(db),
        })!;
        return replyObject(projectFinding(db, updated));
      },
    ),

    http.get<{ id: string }>(apiPath("/findings/:id/observations"), async ({ params }) => {
      await delay();
      if (!db.findings.get(params.id)) {
        return replyNotFound("finding");
      }
      return replyArray(
        db.observations.all().filter((observation) => observation.findingId === params.id),
      );
    }),

    http.post<{ id: string }>(
      apiPath("/findings/:id/observations"),
      async ({ params, request }) => {
        await delay();
        const finding = db.findings.get(params.id);
        if (!finding) {
          return replyNotFound("finding");
        }
        const body = await parseRequestBody(request, manualObservationInputSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const observation = createManualObservation(db, finding, body.data);
        db.observations.insert(observation);
        return replyObject(observation, { created: true });
      },
    ),

    http.put<{ id: string; observationId: string }>(
      apiPath("/findings/:id/observations/:observationId"),
      async ({ params, request }) => {
        await delay();
        if (!getObservation(params.id, params.observationId)) {
          return replyNotFound("observation");
        }
        const body = await parseRequestBody(request, updateObservationSchema);
        if ("reply" in body) {
          return body.reply;
        }
        const observation = db.observations.update(params.observationId, {
          ...body.data,
          ...updatedAudit(db),
        });
        return replyObject(observation!);
      },
    ),

    http.delete<{ id: string; observationId: string }>(
      apiPath("/findings/:id/observations/:observationId"),
      async ({ params }) => {
        await delay();
        if (!getObservation(params.id, params.observationId)) {
          return replyNotFound("observation");
        }
        return replyObject(db.observations.remove(params.observationId)!);
      },
    ),

    http.post<{ id: string; observationId: string }>(
      apiPath("/findings/:id/observations/:observationId/move"),
      async ({ params, request }) => {
        await delay();
        if (!getObservation(params.id, params.observationId)) {
          return replyNotFound("observation");
        }
        const body = await parseRequestBody(request, moveObservationInputSchema);
        if ("reply" in body) {
          return body.reply;
        }
        if (!db.findings.get(body.data.targetFindingId)) {
          return replyNotFound("finding");
        }
        const observation = db.observations.update(params.observationId, {
          findingId: body.data.targetFindingId,
          ...updatedAudit(db),
        });
        return replyObject(observation!);
      },
    ),
  ];
}
