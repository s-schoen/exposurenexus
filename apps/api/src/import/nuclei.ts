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

function parseEndpoint(record: NucleiRecord) {
  if (record.url === undefined && record.host !== undefined && /[\s/?#@\\]/u.test(record.host)) {
    throw new Error("Nuclei endpoint host must be a valid host.");
  }

  if (
    record.url === undefined &&
    typeof record.port === "string" &&
    record.port.length > 0 &&
    !/^\d+$/u.test(record.port)
  ) {
    throw new Error("Nuclei endpoint port must be numeric.");
  }

  const endpoint =
    record.url ??
    `${record.scheme ?? record.type}://${record.host ?? ""}${
      record.port === undefined ? "" : `:${record.port}`
    }${record.path ?? ""}`;
  const parsedUrl = new URL(endpoint);

  return {
    type: AffectedResourceType.WebEndpoint,
    scheme: parsedUrl.protocol.slice(0, -1),
    host: parsedUrl.hostname,
    ...(parsedUrl.port.length === 0 ? {} : { port: Number(parsedUrl.port) }),
    path: parsedUrl.pathname,
    ...(record.method === undefined ? {} : { method: record.method }),
    ...(record.url === undefined ? {} : { reportedUrl: record.url }),
  };
}

function parseEvidence(record: NucleiRecord): string | undefined {
  const sections: Array<string> = [];
  if (record.request) {
    sections.push(`<details><summary>Request</summary>
  
  \`\`\`
  ${record.request}
  \`\`\`
  
  </details>`);
  }
  if (record.response) {
    sections.push(`<details><summary>Response</summary>

  \`\`\`
  ${record.response}
  \`\`\`

  </details>`);
  }
  if (record["curl-command"]) {
    sections.push(`<details><summary>cURL Command</summary>

  \`\`\`shell
  ${record["curl-command"]}
  \`\`\`

  </details>`);
  }

  return sections.length === 0 ? undefined : sections.join("\n\n");
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
