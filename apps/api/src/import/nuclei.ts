import {
  type Finding,
  FindingSource,
  FindingStatus
} from "@openvlp/types/model/finding"
import { AssetType } from "@openvlp/types/model/asset"
import * as vulnerabilityService from "../service/vulnerability.js"
import * as findingService from "../service/finding.js"
import { createLogger } from "../logging.js"
import { z } from "zod/v4"
import { HTTPException } from "hono/http-exception"
import {
  type Vulnerability,
  VulnerabilitySeverity
} from "@openvlp/types/model/vulnerability"
import { getOrCreateAsset } from "./util.js"
import type { ImportContext } from "./importer.js"

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

async function getOrCreateVulnerability(
  ctx: ImportContext,
  finding: NucleiFinding
): Promise<Vulnerability | null> {
  // get all vulnerability mapping and cache them
  const mappings = await vulnerabilityService.listMappings(FindingSource.Nuclei)

  const query = JSON.stringify({
    templateID: finding.templateID
  })

  const mapping = mappings.find((v) => v.matchQuery === query)
  // already exists
  if (mapping) {
    return (await vulnerabilityService.getByID(mapping.vulnerabilityId))!
  }

  // create new mapping and vulnerability
  if (!finding.info.name) {
    logger.warn(
      `no name found in finding with template id ${finding.templateID}. Skipping`
    )
    return null
  }

  // TODO: parse CVE, CWE
  const createdVuln = await vulnerabilityService.create({
    user: ctx.user,
    vulnerability: {
      title: finding.info.name!,
      severity: parseNucleiSeverity(finding.info.severity || "info"),
      description: finding.info.description || "",
      cve: "",
      cwe: ""
    }
  })

  await vulnerabilityService.createMapping(
    createdVuln.id,
    FindingSource.Nuclei,
    query
  )

  return createdVuln
}

export async function parseNucleiFindings(
  ctx: ImportContext,
  file: Buffer
): Promise<Array<Finding>> {
  logger.info("parsing nuclei findings")
  // one json object per line
  const jsonl = file
    .toString()
    .split("\n")
    .filter((line) => line.startsWith("{"))

  const createdFindings: Array<Finding> = []
  let currentLine = 1
  for (const line of jsonl) {
    try {
      const nucleiFinding = nucleiFindingSchema.parse(JSON.parse(line))

      logger.debug(`parsing finding ${currentLine} of ${jsonl.length}`)
      // skip empty lines between actual findings
      if (!nucleiFinding) {
        continue
      }

      if (!nucleiFinding.host) {
        logger.warn(`no host defined in finding ${currentLine}. Skipping`)
        continue
      }

      const host = parseNucleiHostname(nucleiFinding.host)

      // get vulnerability
      const vulnerability = await getOrCreateVulnerability(ctx, nucleiFinding)
      if (!vulnerability) {
        logger.warn(
          `could not find vulnerability for finding ${currentLine}. Skipping`
        )
        continue
      }
      logger.debug(
        `using vulnerability ${vulnerability.id} (${vulnerability.title}) for finding ${currentLine}`
      )

      // check if asset with that name
      const asset = await getOrCreateAsset(AssetType.Host, host)

      // additional metadata for finding deduplication
      const fingerprintInfo = {
        port: nucleiFinding.port || "",
        path: nucleiFinding.path || ""
      }

      const createdFinding = await findingService.createOrUpdate(
        {
          user: ctx.user,
          finding: {
            source: FindingSource.Nuclei,
            status: FindingStatus.Active,
            vulnerabilityId: vulnerability.id,
            assetId: asset.id,
            severity: vulnerability.severity,
            evidence: parseEvidence(nucleiFinding),
            mitigation: nucleiFinding.info.remediation || ""
          },
          firstSeen: new Date()
        },
        fingerprintInfo
      )
      createdFindings.push(createdFinding)
      logger.info(`created finding ${createdFinding.id} for ${host}`)

      currentLine++
    } catch (error) {
      logger.error(error, `failed to parse line ${currentLine}`)
      throw new HTTPException(400, {
        message: `failed to parse line ${currentLine}`
      })
    }
  }

  return createdFindings
}

function parseNucleiSeverity(severity: string): VulnerabilitySeverity {
  // TODO: switch possible options
  return severity as VulnerabilitySeverity
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
