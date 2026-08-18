import {
  AffectedResourceType,
  observationAffectedResourceSchema,
} from "@exposurenexus/types/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { weaknessSchema } from "@exposurenexus/types/model/weakness";
import { z } from "zod/v4";

import type { NormalizedObservationDraft } from "./observation.js";

const nucleiClassificationSchema = z
  .object({
    "cve-id": z.union([z.string(), z.array(z.string())]).nullish(),
    "cwe-id": z.union([z.string(), z.array(z.string())]).nullish(),
  })
  .nullish();

const nucleiRecordSchema = z.object({
  "template-id": z.string().trim().min(1),
  info: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    remediation: z.string().optional(),
    severity: z.string().optional(),
    classification: nucleiClassificationSchema,
  }),
  type: z.string().trim().min(1),
  host: z.string().optional(),
  port: z.union([z.string(), z.number().int()]).optional(),
  scheme: z.string().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
  method: z.string().optional(),
  request: z.string().optional(),
  response: z.string().optional(),
  "curl-command": z.string().optional(),
  timestamp: z.string().optional(),
});

type NucleiRecord = z.infer<typeof nucleiRecordSchema>;

export interface UnsupportedNucleiResult {
  status: "unsupported";
  reason: {
    code: "unsupported_protocol";
    protocol: string;
  };
}

export interface TranslatedNucleiResult {
  status: "translated";
  draft: NormalizedObservationDraft;
}

export type NucleiTranslationResult = UnsupportedNucleiResult | TranslatedNucleiResult;

const supportedProtocols = new Set(["http", "https"]);

function parseIdentifierValues(value: string | string[] | null | undefined): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parseSeverity(value: string | undefined): VulnerabilitySeverity {
  const normalized = value?.trim().toLowerCase();
  return Object.values(VulnerabilitySeverity).includes(normalized as VulnerabilitySeverity)
    ? (normalized as VulnerabilitySeverity)
    : VulnerabilitySeverity.Info;
}

function parseObservedAt(value: string | undefined, ingestionTime: Date): Date {
  if (value === undefined) {
    return new Date(ingestionTime.getTime());
  }

  const observedAt = new Date(value);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error("Nuclei observation timestamp must be a valid date.");
  }

  return observedAt;
}

function parsePort(value: string | number | undefined): number | undefined {
  if (value === undefined || (typeof value === "string" && value.trim().length === 0)) {
    return undefined;
  }

  return typeof value === "number" ? value : Number(value);
}

function parseHost(value: string | undefined): { host?: string; port?: number } {
  if (value === undefined || value.trim().length === 0) {
    return {};
  }

  const rawHost = value.trim();
  try {
    const parsed = new URL(rawHost.includes("://") ? rawHost : `http://${rawHost}`);
    const host = parsed.hostname.replace(/^\[|\]$/gu, "");
    return {
      host,
      ...(parsed.port.length > 0 ? { port: Number(parsed.port) } : {}),
    };
  } catch {
    return {
      host: rawHost,
    };
  }
}

function parseEndpoint(record: NucleiRecord) {
  let parsedUrl: URL | undefined;
  if (record.url !== undefined && record.url.length > 0) {
    try {
      parsedUrl = new URL(record.url);
    } catch {
      parsedUrl = undefined;
    }
  }

  const parsedHost = parseHost(record.host);
  const scheme = parsedUrl?.protocol.slice(0, -1) || record.scheme || record.type;
  const host = parsedUrl?.hostname.replace(/^\[|\]$/gu, "") || parsedHost.host;
  const explicitPort = parsePort(record.port);
  const port = explicitPort ?? (parsedUrl?.port ? Number(parsedUrl.port) : parsedHost.port);
  const path = parsedUrl?.pathname || record.path;

  return {
    type: AffectedResourceType.WebEndpoint,
    ...(scheme === undefined ? {} : { scheme }),
    ...(host === undefined ? {} : { host }),
    ...(port === undefined ? {} : { port }),
    ...(path === undefined ? {} : { path }),
    ...(record.method === undefined ? {} : { method: record.method }),
    ...(record.url === undefined ? {} : { reportedUrl: record.url }),
  };
}

function parseEvidence(record: NucleiRecord): string | undefined {
  if (!record.request) {
    return undefined;
  }

  return `
  <details><summary>Request</summary>
  
  \`\`\`
  ${record.request}
  \`\`\`
  
  </details>
  
  <details><summary>Response</summary>
  
  \`\`\`
  ${record.response}
  \`\`\`
  
  </details>
  
  <details><summary>cURL Command</summary>
    
  \`\`\`shell
  ${record["curl-command"]}
  \`\`\`
  
  </details>
  `;
}

function translateRecord(record: NucleiRecord, ingestionTime: Date): NucleiTranslationResult {
  const protocol = record.type.toLowerCase();
  if (!supportedProtocols.has(protocol)) {
    return {
      status: "unsupported",
      reason: {
        code: "unsupported_protocol",
        protocol: record.type,
      },
    };
  }

  const classification = record.info.classification;
  const weakness = weaknessSchema.parse({
    identifiers: {
      nuclei: [record["template-id"]],
      ...(classification === undefined || classification === null
        ? {}
        : {
            cve: parseIdentifierValues(classification["cve-id"]),
            cwe: parseIdentifierValues(classification["cwe-id"]),
          }),
    },
  });
  const affectedResource = observationAffectedResourceSchema.parse(parseEndpoint(record));
  const evidence = parseEvidence(record);
  const title = record.info.name?.trim() || record["template-id"];

  return {
    status: "translated",
    draft: {
      source: "nuclei",
      title,
      ...(record.info.description === undefined ? {} : { description: record.info.description }),
      ...(evidence === undefined ? {} : { evidence }),
      ...(record.info.remediation === undefined ? {} : { remediation: record.info.remediation }),
      severity: parseSeverity(record.info.severity),
      weakness,
      affectedResource,
      observedAt: parseObservedAt(record.timestamp, ingestionTime),
    },
  };
}

export function translateNucleiRecord(
  input: unknown,
  ingestionTime: Date,
): NucleiTranslationResult {
  if (Number.isNaN(ingestionTime.getTime())) {
    throw new Error("Nuclei ingestion time must be a valid date.");
  }

  return translateRecord(nucleiRecordSchema.parse(input), ingestionTime);
}

export function translateNucleiJsonl(
  input: Buffer | string,
  ingestionTime: Date,
): Array<NucleiTranslationResult> {
  return input
    .toString()
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => translateNucleiRecord(JSON.parse(line), ingestionTime));
}
