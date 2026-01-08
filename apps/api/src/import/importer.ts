import {
  type CreateFinding,
  FindingSeverity,
  FindingSource,
  FindingStatus
} from "@openvlp/types/model/finding"
import { createLogger } from "../logging.js"
import * as assetService from "../service/asset.js"
import { AssetType } from "@openvlp/types/model/asset"

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

export async function parseNucleiFindings(
  file: Buffer
): Promise<Array<CreateFinding>> {
  logger.info("parsing nuclei findings")
  // one json object per line
  const jsonl = file
    .toString()
    .split("\n")
    .filter((line) => line.startsWith("{"))
  const nucleiFindings = jsonl.map(
    (line) => JSON.parse(line) as Record<string, any>
  )

  // find findings that have identical template id and host: these should become a single finding
  const findings: Map<string, CreateFinding> = new Map<string, CreateFinding>()

  let currentLine = 1
  for (const nucleiFinding of nucleiFindings) {
    logger.debug(`parsing finding ${currentLine} of ${jsonl.length}`)
    if (nucleiFinding) {
      const host = parseNucleiHostname(nucleiFinding["host"] as string)

      // check if finding is already parsed
      const existingFinding = findings.get(
        `${host}/${nucleiFinding["template-id"]}`
      )
      if (existingFinding) {
        // TODO: we should append the details of the finding into the existing finding
        continue
      }

      // check if asset with that name
      const asset = await assetService.getByName(host, AssetType.Host)
      if (!asset) {
        logger.warn(`no asset found for host ${host}. Skipping`)
        continue
      }

      findings.set(`${host}/${nucleiFinding["template-id"]}`, {
        source: FindingSource.Nuclei,
        status: FindingStatus.Active,
        title: nucleiFinding["info"]["name"] as string,
        assetId: asset.id,
        severity: parseNucleiSeverity(
          nucleiFinding["info"]["severity"] as string
        ),
        description: (nucleiFinding["info"]["description"] as string) || "",
        evidence: "",
        mitigation: ""
      })
    }
    currentLine++
  }

  return Promise.resolve(findings.values().toArray())
}

function parseNucleiSeverity(severity: string): FindingSeverity {
  // TODO: switch possible options
  return severity as FindingSeverity
}

function parseNucleiHostname(host: string): string {
  // might have format host:port or host
  return host.split(":")[0]
}
