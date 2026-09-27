import { z } from "zod/v4";

export const cvssAssessmentSchema = z.strictObject({
  score: z.number().min(0).max(10).optional(),
  vector: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
});

export const epssAssessmentSchema = z.strictObject({
  score: z.number().min(0).max(1).optional(),
  percentile: z.number().min(0).max(1).optional(),
});

export const weaknessSchema = z.strictObject({
  identifiers: z.record(z.string().min(1), z.array(z.string().min(1))).default({}),
  references: z.array(z.string().min(1)).optional(),
  cvss: z.array(cvssAssessmentSchema).optional(),
  epss: epssAssessmentSchema.optional(),
});

export type CvssAssessment = z.output<typeof cvssAssessmentSchema>;
export type EpssAssessment = z.output<typeof epssAssessmentSchema>;
export type Weakness = z.output<typeof weaknessSchema>;
