import { createFindingSchema, updateFindingSchema } from "@exposurenexus/contracts/model/finding";

import { weaknessSchema } from "@/features/findings/lib/weakness-preview.ts";
import { parseWeaknessText } from "@/features/findings/lib/weakness-text.ts";

import type {
  AffectedResourceType,
  FindingAffectedResource,
} from "@exposurenexus/contracts/model/affected-resource";
import type { CreateManualFinding, UpdateFinding } from "@exposurenexus/contracts/model/finding";
import type { z } from "zod/v4";

// Pure helpers behind the create-finding form and the finding correction dialog, so their
// payload rules are testable without driving the forms.

export type SourceCodeResource = Extract<
  FindingAffectedResource,
  { type: AffectedResourceType.SourceCode }
>;
export type SourceLocationKey = "startLine" | "startColumn" | "endLine" | "endColumn";

export function emptyResource(type: AffectedResourceType): FindingAffectedResource {
  return { type };
}

/** Trimmed input, or `undefined` so empty fields drop out of the resource. */
export function optionalStringValue(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalNumberValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

/** Sets one location field; without a start line the whole location is removed. */
export function updateResourceLocation(
  resource: SourceCodeResource,
  key: SourceLocationKey,
  rawValue: string,
): SourceCodeResource {
  const value = optionalNumberValue(rawValue);
  const startLine = key === "startLine" ? value : resource.location?.startLine;
  const startColumn = key === "startColumn" ? value : resource.location?.startColumn;
  const endLine = key === "endLine" ? value : resource.location?.endLine;
  const endColumn = key === "endColumn" ? value : resource.location?.endColumn;

  return {
    ...resource,
    location:
      startLine === undefined
        ? undefined
        : {
            startLine,
            ...(startColumn === undefined ? {} : { startColumn }),
            ...(endLine === undefined ? {} : { endLine }),
            ...(endColumn === undefined ? {} : { endColumn }),
          },
  };
}

export type FormPayloadResult<T> =
  | { payload: T; error?: never }
  | { payload?: never; error: string };

const WEAKNESS_SYNTAX_ERROR = "Weakness identifiers must use namespace=identifier entries.";

function firstIssueMessage(prefix: string, error: z.ZodError) {
  const issue = error.issues[0];
  const location = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${prefix} ${location}${issue.message}`;
}

/**
 * Builds the create payload from the form values and the weakness text: trims the title,
 * parses and canonicalizes the weakness, and deduplicates catalog IDs.
 */
export function buildCreateFindingPayload(
  values: Omit<CreateManualFinding, "weakness">,
  weaknessDraft: string,
): FormPayloadResult<CreateManualFinding> {
  const weakness = parseWeaknessText(weaknessDraft);
  if (!weakness) {
    return { error: WEAKNESS_SYNTAX_ERROR };
  }

  const canonicalWeakness = weaknessSchema.safeParse(weakness);
  if (!canonicalWeakness.success) {
    return { error: "Invalid weakness identifiers" };
  }

  const result = createFindingSchema.safeParse({
    ...values,
    title: values.title.trim(),
    weakness: canonicalWeakness.data,
    vulnerabilityIds: [...new Set(values.vulnerabilityIds)],
  });
  if (!result.success) {
    return { error: firstIssueMessage("Unable to create finding.", result.error) };
  }
  return { payload: result.data };
}

/** Builds a correction payload, keeping weakness fields the text form does not edit. */
export function buildFindingCorrection(
  draft: UpdateFinding,
  weaknessDraft: string,
): FormPayloadResult<UpdateFinding> {
  const weakness = parseWeaknessText(weaknessDraft, draft.weakness);
  if (!weakness) {
    return { error: WEAKNESS_SYNTAX_ERROR };
  }

  const result = updateFindingSchema.safeParse({ ...draft, weakness });
  if (!result.success) {
    return { error: firstIssueMessage("Unable to save correction.", result.error) };
  }
  return { payload: result.data };
}
