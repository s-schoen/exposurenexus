import {
  type CreateFinding,
  type Vulnerability,
  FindingSource
} from "@openvlp/types/model/finding"
import { createLogger } from "../logging.js"
import { parseNucleiFindings } from "./nuclei.js"
import type { User } from "better-auth"

const logger = createLogger("findings/import")

export interface ImportContext {
  user: User
}

export async function parseFindingsFromFile(
  ctx: ImportContext,
  type: string,
  file: Buffer
): Promise<Array<Vulnerability>> {
  switch (type) {
    case FindingSource.Nuclei:
      return parseNucleiFindings(ctx, file)
    default:
      logger.error(`unknown finding source: ${type}`)
      return []
  }
}
