import { z } from "zod/v4";

export const weaknessSchema = z.strictObject({
  identifiers: z.record(z.string().min(1), z.array(z.string().min(1))).default({}),
});
export type Weakness = z.output<typeof weaknessSchema>;
