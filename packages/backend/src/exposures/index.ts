export { createExposures } from "./exposures.js";
export type { Exposures } from "./exposures.js";
export type {
  CreateManualFindingCommand,
  CreateManualObservationCommand,
  DeleteFindingByIDCommand,
  DeleteObservationCommand,
  ExposureFindings,
  FindingCreatedOutcome,
  FindingDeletedOutcome,
  FindingUpdatedOutcome,
  FindingVulnerabilityMutationCommand,
  FindingVulnerabilityMutationOutcome,
  MoveObservationCommand,
  ObservationCreatedOutcome,
  ObservationDeletedOutcome,
  ObservationMovedOutcome,
  ObservationUpdatedOutcome,
  UpdateFindingByIDCommand,
  UpdateObservationCommand,
} from "./findings.js";
export type {
  CreateVulnerabilityCommand,
  DeleteVulnerabilityByIDCommand,
  ExposureVulnerabilities,
  UpdateVulnerabilityByIDCommand,
  VulnerabilityCreatedOutcome,
  VulnerabilityDeletedOutcome,
  VulnerabilityUpdatedOutcome,
} from "./vulnerabilities.js";
export type { ExposureStatistics } from "./statistics.js";
