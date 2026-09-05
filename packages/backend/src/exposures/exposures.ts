import { createAssets } from "../assets/assets.js";
import { getUserProfileByID } from "../identity/user-profile-persistence.js";
import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../runtime.js";
import { createFindingRepository } from "./finding-repository.js";
import { createFindings, type ExposureFindings } from "./findings.js";
import { createObservationRepository } from "./observation-repository.js";
import { createStatistics, type ExposureStatistics } from "./statistics.js";
import { createVulnerabilities, type ExposureVulnerabilities } from "./vulnerabilities.js";
import { createVulnerabilityRepository } from "./vulnerability-repository.js";

export interface Exposures {
  findings: ExposureFindings;
  vulnerabilities: ExposureVulnerabilities;
  statistics: ExposureStatistics;
}

const exposuresRuntimeKey = {};

export function createExposures(runtime: BackendRuntime): Exposures {
  return getOrCreateRuntimeValue(runtime, exposuresRuntimeKey, () => {
    const database = getRuntimeDatabase(runtime);
    const logger = getRuntimeLogger(runtime);
    const findingRepository = createFindingRepository(database);
    const observationRepository = createObservationRepository(database);
    const vulnerabilityRepository = createVulnerabilityRepository(database);
    const assetInventory = createAssets(runtime).inventory;
    const userProfileLookup = {
      getByID: (id: string) => getUserProfileByID(database, id),
    };
    const vulnerabilities = createVulnerabilities({
      vulnerabilityRepository,
      userProfileLookup,
      logger: logger.child({ capability: "exposures", component: "vulnerabilities" }),
    });

    return {
      findings: createFindings({
        findingRepository,
        observationRepository,
        assetInventory,
        userProfileLookup,
        vulnerabilityReader: vulnerabilities,
        logger: logger.child({ capability: "exposures", component: "findings" }),
      }),
      vulnerabilities,
      statistics: createStatistics({
        findingRepository,
        logger: logger.child({ capability: "exposures", component: "statistics" }),
      }),
    } satisfies Exposures;
  });
}
