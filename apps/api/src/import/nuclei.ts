import { AssetType, type Asset } from "@exposurenexus/types/model/asset";
import { type Finding, FindingSource, FindingStatus } from "@exposurenexus/types/model/finding";
import {
  type Vulnerability,
  VulnerabilitySeverity,
} from "@exposurenexus/types/model/vulnerability";
import { z } from "zod/v4";

import { badRequest } from "../lib/api-error.js";

import type { FindingService } from "../service/finding.js";
import type { VulnerabilityService } from "../service/vulnerability.js";
import type { ImportContext } from "./importer.js";
import type { Logger } from "pino";

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
          "cve-id": z.union([z.string(), z.array(z.string()), z.null()]).optional(),
          "cwe-id": z.union([z.string(), z.array(z.string()), z.null()]).optional(),
          "cvss-metrics": z.string().optional(),
          "cvss-score": z.number().optional(),
          "epss-score": z.number().optional(),
          "epss-percentile": z.number().optional(),
          cpe: z.string().optional(),
        })
        .optional(),
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
    "curl-command": z.string().optional(),
  })
  .transform((data) => ({
    templateID: data["template-id"],
    curlCommand: data["curl-command"],
    ...data,
  }));

type NucleiFinding = z.infer<typeof nucleiFindingSchema>;

type NucleiVulnerabilityService = Pick<
  VulnerabilityService,
  "listMappings" | "getByID" | "create" | "createMapping"
>;

type NucleiFindingService = Pick<FindingService, "createOrUpdate">;

interface NucleiFindingParserDependencies {
  vulnerabilityService: NucleiVulnerabilityService;
  findingService: NucleiFindingService;
  getOrCreateAsset(
    type: AssetType,
    name: string,
    eventContext?: ImportContext["eventContext"],
  ): Promise<Asset>;
  logger: Logger;
}

export function createNucleiFindingParser(dependencies: NucleiFindingParserDependencies) {
  const { vulnerabilityService, findingService, logger } = dependencies;
  async function getOrCreateVulnerability(
    ctx: ImportContext,
    finding: NucleiFinding,
  ): Promise<Vulnerability | null> {
    const mappings = await vulnerabilityService.listMappings(FindingSource.Nuclei);

    const query = JSON.stringify({
      templateID: finding.templateID,
    });

    const mapping = mappings.find((v) => v.matchQuery === query);
    if (mapping) {
      return (await vulnerabilityService.getByID(mapping.vulnerabilityId))!;
    }

    if (!finding.info.name) {
      logger.warn(`no name found in finding with template id ${finding.templateID}. Skipping`);
      return null;
    }

    const createdVuln = await vulnerabilityService.create({
      user: ctx.user,
      eventContext: ctx.eventContext,
      vulnerability: {
        title: finding.info.name,
        severity: parseNucleiSeverity(finding.info.severity || "info"),
        description: finding.info.description || "",
        cve: "",
        cwe: 0,
      },
    });

    await vulnerabilityService.createMapping({
      vulnerabilityId: createdVuln.id,
      source: FindingSource.Nuclei,
      matchQuery: query,
      eventContext: ctx.eventContext,
    });

    return createdVuln;
  }

  return {
    async parseNucleiFindings(ctx: ImportContext, file: Buffer): Promise<Array<Finding>> {
      logger.info("parsing nuclei findings");
      const jsonl = file
        .toString()
        .split("\n")
        .filter((line) => line.startsWith("{"));

      const createdFindings: Array<Finding> = [];
      let currentLine = 1;
      for (const line of jsonl) {
        try {
          const nucleiFinding = nucleiFindingSchema.parse(JSON.parse(line));

          logger.debug(`parsing finding ${currentLine} of ${jsonl.length}`);
          if (!nucleiFinding) {
            continue;
          }

          if (!nucleiFinding.host) {
            logger.warn(`no host defined in finding ${currentLine}. Skipping`);
            continue;
          }

          const host = parseNucleiHostname(nucleiFinding.host);
          const vulnerability = await getOrCreateVulnerability(ctx, nucleiFinding);
          if (!vulnerability) {
            logger.warn(`could not find vulnerability for finding ${currentLine}. Skipping`);
            continue;
          }
          logger.debug(
            `using vulnerability ${vulnerability.id} (${vulnerability.title}) for finding ${currentLine}`,
          );

          const asset = await dependencies.getOrCreateAsset(AssetType.Host, host, ctx.eventContext);
          const fingerprintInfo = {
            port: nucleiFinding.port || "",
            path: nucleiFinding.path || "",
          };

          const { finding, created } = await findingService.createOrUpdate({
            user: ctx.user,
            finding: {
              source: FindingSource.Nuclei,
              status: FindingStatus.Active,
              vulnerabilityId: vulnerability.id,
              assetId: asset.id,
              severity: vulnerability.severity,
              evidence: parseEvidence(nucleiFinding),
              mitigation: nucleiFinding.info.remediation || "",
              assigneeId: null,
              dueDate: null,
            },
            firstSeen: new Date(),
            fingerprintOptions: fingerprintInfo,
            eventContext: ctx.eventContext,
          });
          createdFindings.push(finding);
          logger.info(`${created ? "created" : "updated"} finding ${finding.id} for ${host}`);

          currentLine++;
        } catch (error) {
          logger.error(error, `failed to parse line ${currentLine}`);
          throw badRequest(`failed to parse line ${currentLine}`);
        }
      }

      return createdFindings;
    },
  };
}

function parseNucleiSeverity(severity: string): VulnerabilitySeverity {
  return severity as VulnerabilitySeverity;
}

function parseNucleiHostname(host: string): string {
  return host.split(":")[0];
}

function parseEvidence(finding: NucleiFinding): string {
  if (!finding.request) {
    return "";
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
  `;
}
