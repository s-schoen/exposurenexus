import { type CreateFinding, FindingSource } from "@openvlp/types/model/finding"
import { createLogger } from "../logging.js"
import { parseNucleiFindings } from "./nuclei.js"

const logger = createLogger("findings/import")

export async function parseFindingsFromFile(
  type: string,
  file: Buffer
): Promise<Array<CreateFinding>> {
  switch (type) {
    case FindingSource.Nuclei:
      return parseNucleiFindings(file)
    default:
      logger.error(`unknown finding source: ${type}`)
      return []
  }
}
