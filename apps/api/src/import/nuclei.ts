import {
  type CreateFinding,
  FindingSeverity,
  FindingSource,
  FindingStatus
} from "@openvlp/types/model/finding"
import * as assetService from "../service/asset.js"
import { AssetType } from "@openvlp/types/model/asset"
import { createLogger } from "../logging.js"
import { z } from "zod/v4"
import { HTTPException } from "hono/http-exception"

const logger = createLogger("findings/import/nuclei")

const nucleiFindingSchema = z
  .object({
    template: z.string().optional(),
    "template-id": z.string(),
    info: z.object({
      name: z.string().optional(),
      tags: z.array(z.string()).optional(),
      impact: z.string().optional(),
      reference: z.array(z.string()).optional(),
      description: z.string().optional(),
      remediation: z.string().optional(),
      severity: z.string().optional(),
      classification: z
        .object({
          "cve-id": z
            .union([z.string(), z.array(z.string()), z.null()])
            .optional(),
          "cwe-id": z
            .union([z.string(), z.array(z.string()), z.null()])
            .optional(),
          "cvss-metrics": z.string().optional(),
          "cvss-score": z.number().optional(),
          "epss-score": z.number().optional(),
          "epss-percentile": z.number().optional(),
          cpe: z.string().optional()
        })
        .optional()
    }),
    type: z.string(),
    host: z.string().optional(),
    port: z.string().optional(),
    scheme: z.string().optional(),
    url: z.string().optional(),
    path: z.string().optional(),
    request: z.string().optional(),
    response: z.string().optional(),
    meta: z.record(z.string(), z.any()).optional(),
    ip: z.string().optional(),
    timestamp: z.iso.datetime({ offset: true }).optional(),
    "curl-command": z.string().optional()
  })
  .transform((data) => ({
    templateID: data["template-id"],
    curlCommand: data["curl-command"],
    ...data
  }))

type NucleiFinding = z.infer<typeof nucleiFindingSchema>

export async function parseNucleiFindings(
  file: Buffer
): Promise<Array<CreateFinding>> {
  logger.info("parsing nuclei findings")
  // one json object per line
  const jsonl = file
    .toString()
    .split("\n")
    .filter((line) => line.startsWith("{"))

  // find findings that have identical template id and host: these should become a single finding
  const findings: Map<string, CreateFinding> = new Map<string, CreateFinding>()

  let currentLine = 1
  for (const line of jsonl) {
    try {
      const nucleiFinding = nucleiFindingSchema.parse(JSON.parse(line))

      logger.debug(`parsing finding ${currentLine} of ${jsonl.length}`)
      if (nucleiFinding) {
        if (!nucleiFinding.host) {
          logger.warn(`no host found in finding ${currentLine}. Skipping`)
          continue
        }

        const host = parseNucleiHostname(nucleiFinding.host)

        // check if finding is already parsed
        const existingFinding = findings.get(
          `${host}/${nucleiFinding.templateID}`
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

        if (!nucleiFinding.info.name) {
          logger.warn(`no name found in finding ${currentLine}. Skipping`)
          continue
        }

        findings.set(`${host}/${nucleiFinding.templateID}`, {
          source: FindingSource.Nuclei,
          status: FindingStatus.Active,
          title: nucleiFinding.info.name,
          assetId: asset.id,
          severity: parseNucleiSeverity(nucleiFinding.info.severity || "info"),
          description: nucleiFinding.info.description || "",
          evidence: parseEvidence(nucleiFinding),
          mitigation: nucleiFinding.info.remediation || ""
        })
      }
      currentLine++
    } catch (error) {
      logger.error(error, `failed to parse line ${currentLine}`)
      throw new HTTPException(400, {
        message: `failed to parse line ${currentLine}`
      })
    }
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

function parseEvidence(finding: NucleiFinding): string {
  if (!finding.request) {
    return ""
  }

  return `
  <details><summary>Request</summary>
  
  \`\`\`
  ${finding.request}
  \`\`\`
  
  </details>
  
  <details><summary>Response</summary>
  
  \`\`\`
  ${finding.response}
  \`\`\`
  
  </details>
  
  <details><summary>cURL Command</summary>
    
  \`\`\`shell
  ${finding.curlCommand}
  \`\`\`
  
  </details>
  `
}
