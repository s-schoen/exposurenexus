import { FindingSource, type Finding } from "@openvlp/types/model/finding"
import type { UserProfile } from "@openvlp/types/model/user"
import type { Logger } from "pino"
import type { DomainEventContext } from "../lib/eventbus/events/index.js"

export interface ImportContext {
  user: UserProfile
  eventContext?: DomainEventContext
}

interface NucleiFindingParser {
  parseNucleiFindings(ctx: ImportContext, file: Buffer): Promise<Array<Finding>>
}

interface FindingImporterDependencies {
  nucleiParser: NucleiFindingParser
  logger: Logger
}

export function createFindingImporter({
  nucleiParser,
  logger
}: FindingImporterDependencies) {
  return {
    async parseFindingsFromFile(
      ctx: ImportContext,
      type: string,
      file: Buffer
    ): Promise<Array<Finding>> {
      switch (type) {
        case FindingSource.Nuclei:
          return nucleiParser.parseNucleiFindings(ctx, file)
        default:
          logger.error(`unknown finding source: ${type}`)
          return []
      }
    }
  }
}
