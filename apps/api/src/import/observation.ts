import type {
  FindingAffectedResource,
  ObservationAffectedResource,
} from "@exposurenexus/contracts/model/affected-resource";
import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import type { Weakness } from "@exposurenexus/contracts/model/weakness";

export interface NormalizedObservationDraft {
  source: string;
  title: string;
  description?: string;
  evidence?: string;
  remediation?: string;
  severity: VulnerabilitySeverity;
  weakness: Weakness;
  affectedResource: ObservationAffectedResource;
  observedAt: Date;
}

export interface ObservationResolverInput {
  assetId: string;
  observation: NormalizedObservationDraft;
}

export interface CanonicalFindingDraft {
  title: string;
  severity: VulnerabilitySeverity;
  weakness: Weakness;
  affectedResource: FindingAffectedResource;
}

export interface ObservationSkipReason {
  code: string;
  details?: Record<string, string>;
}

export type ObservationResolution =
  | {
      kind: "attach";
      findingId: string;
    }
  | {
      kind: "create";
      canonicalFinding: CanonicalFindingDraft;
    }
  | {
      kind: "skip";
      reason: ObservationSkipReason;
    };

export interface ObservationResolver {
  resolve(input: ObservationResolverInput): Promise<ObservationResolution>;
}
