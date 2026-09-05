import { createAssets } from "../assets/assets.js";
import { getUserProfileByID } from "../identity/user-profile-persistence.js";
import {
  getOrCreateRuntimeValue,
  getRuntimeDatabase,
  getRuntimeLogger,
  type BackendRuntime,
} from "../runtime.js";
import * as findingPersistence from "./finding-persistence.js";
import * as findingProjection from "./finding-projection.js";
import * as findingVulnerabilityPersistence from "./finding-vulnerability-persistence.js";
import { createFindings, type ExposureFindings } from "./findings.js";
import * as observationPersistence from "./observation-persistence.js";
import * as statisticsPersistence from "./statistics-persistence.js";
import { createStatistics, type ExposureStatistics } from "./statistics.js";
import { createVulnerabilities, type ExposureVulnerabilities } from "./vulnerabilities.js";
import * as vulnerabilityPersistence from "./vulnerability-persistence.js";

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
    const assetInventory = createAssets(runtime).inventory;
    const userProfileLookup = {
      getByID: (executor: Parameters<typeof getUserProfileByID>[0], id: string) =>
        getUserProfileByID(executor, id),
    };
    const vulnerabilities = createVulnerabilities({
      database,
      vulnerabilityPersistence,
      userProfileLookup,
      logger: logger.child({ capability: "exposures", component: "vulnerabilities" }),
    });

    return {
      findings: createFindings({
        database,
        findingProjection,
        findingPersistence,
        observationPersistence,
        findingVulnerabilityPersistence,
        vulnerabilityPersistence,
        assetInventory,
        userProfileLookup,
        logger: logger.child({ capability: "exposures", component: "findings" }),
      }),
      vulnerabilities,
      statistics: createStatistics({
        database,
        statisticsPersistence,
        logger: logger.child({ capability: "exposures", component: "statistics" }),
      }),
    } satisfies Exposures;
  });
}
