import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../../runtime.js";
import { createAssets } from "../assets/assets.js";
import { getUserProfileByID } from "../identity/users/user-profile-persistence.js";
import * as vulnerabilityPersistence from "../vulnerabilities/vulnerability-persistence.js";
import * as findingPersistence from "./finding-persistence.js";
import * as findingProjection from "./finding-projection.js";
import * as findingVulnerabilityPersistence from "./finding-vulnerability-persistence.js";
import { createFindingsBehavior, type Findings } from "./findings.js";
import * as observationPersistence from "./observation-persistence.js";

export type {
  Findings,
  CreateManualFindingCommand,
  CreateManualObservationCommand,
  DeleteFindingByIDCommand,
  DeleteObservationCommand,
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

const findingsRuntimeKey = {};

export function createFindings(runtime: BackendRuntime): Findings {
  return getOrCreateRuntimeValue(runtime, findingsRuntimeKey, () =>
    createFindingsBehavior({
      database: getRuntimeDatabase(runtime),
      findingProjection,
      findingPersistence,
      observationPersistence,
      findingVulnerabilityPersistence,
      vulnerabilityPersistence,
      assetInventory: createAssets(runtime).inventory,
      userProfileLookup: { getByID: getUserProfileByID },
      logger: getRuntimeLogger(runtime).child({ capability: "exposures", component: "findings" }),
    }),
  );
}
