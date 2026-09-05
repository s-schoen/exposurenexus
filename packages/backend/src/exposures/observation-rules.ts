import {
  manualObservationInputSchema as observationInput,
  updateObservationSchema as observationUpdate,
} from "@exposurenexus/contracts/model/observation";
import { z } from "zod/v4";

import { weaknessSchema } from "./weakness-rules.js";
const fields = { title: z.string().trim().min(1).optional(), weakness: weaknessSchema.optional() };
export const manualObservationInputSchema = observationInput.extend(fields);
export const updateObservationSchema = observationUpdate.safeExtend(fields);
