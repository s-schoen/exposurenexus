import { zValidator as honoZodValidator } from "@hono/zod-validator";

import { badRequest } from "./api-error.js";

import type { ValidationTargets } from "hono";
import type { z } from "zod/v4";

/**
 * `zValidator` from `@hono/zod-validator`, but invalid input becomes the API error envelope
 * (`error: "Bad Request"`, `reason`: the zod message) instead of the raw zod result.
 */
export function zValidator<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return honoZodValidator(target, schema, (result) => {
    if (!result.success) {
      throw badRequest("Bad Request", { reason: result.error.message });
    }
  });
}
