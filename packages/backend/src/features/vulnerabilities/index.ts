import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../../runtime.js";
import { getUserProfileByID } from "../identity/users/user-profile-persistence.js";
import { createVulnerabilitiesBehavior, type Vulnerabilities } from "./vulnerabilities.js";
import * as vulnerabilityPersistence from "./vulnerability-persistence.js";

export type {
  Vulnerabilities,
  CreateVulnerabilityCommand,
  DeleteVulnerabilityByIDCommand,
  UpdateVulnerabilityByIDCommand,
  VulnerabilityCreatedOutcome,
  VulnerabilityDeletedOutcome,
  VulnerabilityUpdatedOutcome,
} from "./vulnerabilities.js";

const vulnerabilitiesRuntimeKey = {};

export function createVulnerabilities(runtime: BackendRuntime): Vulnerabilities {
  return getOrCreateRuntimeValue(runtime, vulnerabilitiesRuntimeKey, () =>
    createVulnerabilitiesBehavior({
      database: getRuntimeDatabase(runtime),
      vulnerabilityPersistence,
      userProfileLookup: { getByID: getUserProfileByID },
      logger: getRuntimeLogger(runtime).child({
        capability: "exposures",
        component: "vulnerabilities",
      }),
    }),
  );
}
