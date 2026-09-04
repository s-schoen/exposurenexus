import { createDomainEventEmitter } from "./eventbus/events/index.js";

import type {
  DomainEventContext,
  DomainEventEmitter,
  EventSubjects,
  FindingEventPayloads,
  ObservationEventPayloads,
  VulnerabilityEventPayloads,
} from "./eventbus/events/index.js";
import type {
  CreateManualFindingCommand,
  CreateManualObservationCommand,
  DeleteFindingByIDCommand,
  DeleteObservationCommand,
  DeleteVulnerabilityByIDCommand,
  Exposures,
  ExposureFindings,
  ExposureStatistics,
  ExposureVulnerabilities,
  FindingVulnerabilityMutationCommand,
  MoveObservationCommand,
  UpdateFindingByIDCommand,
  UpdateObservationCommand,
} from "@exposurenexus/backend/exposures";
import type {
  CreateManualFinding,
  Finding,
  UpdateFinding,
} from "@exposurenexus/contracts/model/finding";
import type {
  ManualObservationInput,
  MoveObservationInput,
  Observation,
  UpdateObservation,
} from "@exposurenexus/contracts/model/observation";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type {
  VulnerabilityCatalog,
  VulnerabilityInput,
} from "@exposurenexus/contracts/model/vulnerability";

export interface CreateApiFindingOptions {
  finding: CreateManualFinding;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateApiFindingOptions {
  id: string;
  finding: UpdateFinding;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface ApiFindingVulnerabilityOptions {
  findingId: string;
  vulnerabilityId: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface CreateApiObservationOptions {
  findingId: string;
  observation: ManualObservationInput;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateApiObservationOptions {
  findingId: string;
  observationId: string;
  observation: UpdateObservation;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface DeleteApiObservationOptions {
  findingId: string;
  observationId: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface MoveApiObservationOptions extends MoveObservationInput {
  findingId: string;
  observationId: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface ApiObservationMutationResult {
  observation: Observation;
  finding: Finding;
}

export interface ApiMoveObservationResult {
  observation: Observation;
  sourceFinding: Finding;
  targetFinding: Finding;
}

export interface ApiFindingVulnerabilityMutationResult {
  finding: Finding;
  changed: boolean;
}

export interface ApiFindingOperations {
  listAll: ExposureFindings["listAll"];
  getByID: ExposureFindings["getByID"];
  createManual(options: CreateApiFindingOptions): Promise<Finding>;
  listObservations: ExposureFindings["listObservations"];
  createManualObservation(
    options: CreateApiObservationOptions,
  ): Promise<ApiObservationMutationResult | null>;
  updateObservation(
    options: UpdateApiObservationOptions,
  ): Promise<ApiObservationMutationResult | null>;
  deleteObservation(
    options: DeleteApiObservationOptions,
  ): Promise<ApiObservationMutationResult | null>;
  moveObservation(options: MoveApiObservationOptions): Promise<ApiMoveObservationResult | null>;
  updateByID(options: UpdateApiFindingOptions): Promise<Finding | null>;
  deleteByID(id: string, eventContext?: DomainEventContext): Promise<Finding | null>;
  linkVulnerability(
    options: ApiFindingVulnerabilityOptions,
  ): Promise<ApiFindingVulnerabilityMutationResult | null>;
  unlinkVulnerability(
    options: ApiFindingVulnerabilityOptions,
  ): Promise<ApiFindingVulnerabilityMutationResult | null>;
}

export interface CreateApiVulnerabilityOptions {
  vulnerability: VulnerabilityInput;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateApiVulnerabilityOptions {
  id: string;
  vulnerability: VulnerabilityInput;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface ApiVulnerabilityOperations {
  listAll: ExposureVulnerabilities["listAll"];
  getByID: ExposureVulnerabilities["getByID"];
  create(options: CreateApiVulnerabilityOptions): Promise<VulnerabilityCatalog>;
  updateByID(options: UpdateApiVulnerabilityOptions): Promise<VulnerabilityCatalog | null>;
  deleteByID(id: string, eventContext?: DomainEventContext): Promise<VulnerabilityCatalog | null>;
}

export type ApiStatisticsOperations = ExposureStatistics;

export interface ApiExposures {
  findings: ApiFindingOperations;
  vulnerabilities: ApiVulnerabilityOperations;
  statistics: ApiStatisticsOperations;
}

function requirePerformedBy(eventContext: DomainEventContext | undefined): string {
  if (!eventContext?.actor) {
    throw new TypeError("exposure mutations require an authenticated actor");
  }

  return eventContext.actor;
}

export function decorateExposuresWithEvents(
  exposures: Exposures,
  domainEventEmitter: DomainEventEmitter,
): ApiExposures {
  const emitFindingEvent = createDomainEventEmitter<EventSubjects<FindingEventPayloads>>(
    domainEventEmitter,
    "finding",
  );
  const emitObservationEvent = createDomainEventEmitter<EventSubjects<ObservationEventPayloads>>(
    domainEventEmitter,
    "observation",
  );
  const emitVulnerabilityEvent = createDomainEventEmitter<
    EventSubjects<VulnerabilityEventPayloads>
  >(domainEventEmitter, "vulnerability");

  return {
    findings: {
      listAll: exposures.findings.listAll.bind(exposures.findings),
      getByID: exposures.findings.getByID.bind(exposures.findings),
      listObservations: exposures.findings.listObservations.bind(exposures.findings),

      async createManual({ finding, user, eventContext }): Promise<Finding> {
        const command: CreateManualFindingCommand = {
          finding,
          performedBy: user.id,
        };
        const outcome = await exposures.findings.createManual(command);
        emitFindingEvent("finding.created", { finding: outcome.current }, eventContext);
        emitObservationEvent(
          "observation.created",
          { observation: outcome.observation },
          eventContext,
        );
        return outcome.current;
      },

      async createManualObservation({
        findingId,
        observation,
        user,
        eventContext,
      }): Promise<ApiObservationMutationResult | null> {
        const command: CreateManualObservationCommand = {
          findingId,
          observation,
          performedBy: user.id,
        };
        const outcome = await exposures.findings.createManualObservation(command);
        if (!outcome) {
          return null;
        }

        emitObservationEvent(
          "observation.created",
          { observation: outcome.observation },
          eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: outcome.previousFinding, current: outcome.currentFinding },
          eventContext,
        );
        return { observation: outcome.observation, finding: outcome.currentFinding };
      },

      async updateObservation({
        findingId,
        observationId,
        observation,
        user,
        eventContext,
      }): Promise<ApiObservationMutationResult | null> {
        const command: UpdateObservationCommand = {
          findingId,
          observationId,
          observation,
          performedBy: user.id,
        };
        const outcome = await exposures.findings.updateObservation(command);
        if (!outcome) {
          return null;
        }

        emitObservationEvent(
          "observation.updated",
          { previous: outcome.previousObservation, current: outcome.observation },
          eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: outcome.previousFinding, current: outcome.currentFinding },
          eventContext,
        );
        return { observation: outcome.observation, finding: outcome.currentFinding };
      },

      async deleteObservation({
        findingId,
        observationId,
        user,
        eventContext,
      }): Promise<ApiObservationMutationResult | null> {
        const command: DeleteObservationCommand = {
          findingId,
          observationId,
          performedBy: user.id,
        };
        const outcome = await exposures.findings.deleteObservation(command);
        if (!outcome) {
          return null;
        }

        emitObservationEvent(
          "observation.deleted",
          { observation: outcome.observation },
          eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: outcome.previousFinding, current: outcome.currentFinding },
          eventContext,
        );
        return { observation: outcome.observation, finding: outcome.currentFinding };
      },

      async moveObservation({
        findingId,
        observationId,
        targetFindingId,
        user,
        eventContext,
      }): Promise<ApiMoveObservationResult | null> {
        const command: MoveObservationCommand = {
          findingId,
          observationId,
          targetFindingId,
          performedBy: user.id,
        };
        const outcome = await exposures.findings.moveObservation(command);
        if (!outcome) {
          return null;
        }

        emitObservationEvent(
          "observation.moved",
          { previous: outcome.previousObservation, current: outcome.observation },
          eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: outcome.sourcePrevious, current: outcome.sourceCurrent },
          eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: outcome.targetPrevious, current: outcome.targetCurrent },
          eventContext,
        );
        return {
          observation: outcome.observation,
          sourceFinding: outcome.sourceCurrent,
          targetFinding: outcome.targetCurrent,
        };
      },

      async updateByID({ id, finding, user, eventContext }): Promise<Finding | null> {
        const command: UpdateFindingByIDCommand = {
          id,
          finding,
          performedBy: user.id,
        };
        const outcome = await exposures.findings.updateByID(command);
        if (!outcome) {
          return null;
        }

        emitFindingEvent(
          "finding.updated",
          { previous: outcome.previous, current: outcome.current },
          eventContext,
        );
        return outcome.current;
      },

      async deleteByID(id, eventContext): Promise<Finding | null> {
        const command: DeleteFindingByIDCommand = {
          id,
          performedBy: requirePerformedBy(eventContext),
        };
        const outcome = await exposures.findings.deleteByID(command);
        if (!outcome) {
          return null;
        }

        emitFindingEvent("finding.deleted", { finding: outcome.previous }, eventContext);
        return outcome.previous;
      },

      async linkVulnerability({
        findingId,
        vulnerabilityId,
        user,
        eventContext,
      }): Promise<ApiFindingVulnerabilityMutationResult | null> {
        const command: FindingVulnerabilityMutationCommand = {
          findingId,
          vulnerabilityId,
          performedBy: user.id,
        };
        const outcome = await exposures.findings.linkVulnerability(command);
        if (!outcome) {
          return null;
        }

        if (outcome.changed && outcome.link) {
          emitFindingEvent(
            "finding.vulnerability.linked",
            {
              finding: outcome.finding,
              vulnerability: outcome.vulnerability,
              link: outcome.link,
            },
            eventContext,
          );
        }
        return { finding: outcome.finding, changed: outcome.changed };
      },

      async unlinkVulnerability({
        findingId,
        vulnerabilityId,
        user,
        eventContext,
      }): Promise<ApiFindingVulnerabilityMutationResult | null> {
        const command: FindingVulnerabilityMutationCommand = {
          findingId,
          vulnerabilityId,
          performedBy: user.id,
        };
        const outcome = await exposures.findings.unlinkVulnerability(command);
        if (!outcome) {
          return null;
        }

        if (outcome.changed && outcome.link) {
          emitFindingEvent(
            "finding.vulnerability.unlinked",
            {
              finding: outcome.finding,
              vulnerability: outcome.vulnerability,
              link: outcome.link,
            },
            eventContext,
          );
        }
        return { finding: outcome.finding, changed: outcome.changed };
      },
    },

    vulnerabilities: {
      listAll: exposures.vulnerabilities.listAll.bind(exposures.vulnerabilities),
      getByID: exposures.vulnerabilities.getByID.bind(exposures.vulnerabilities),

      async create({ vulnerability, user, eventContext }): Promise<VulnerabilityCatalog> {
        const outcome = await exposures.vulnerabilities.create({
          vulnerability,
          performedBy: user.id,
        });
        emitVulnerabilityEvent(
          "vulnerability.created",
          { vulnerability: outcome.current },
          eventContext,
        );
        return outcome.current;
      },

      async updateByID({
        id,
        vulnerability,
        user,
        eventContext,
      }): Promise<VulnerabilityCatalog | null> {
        const outcome = await exposures.vulnerabilities.updateByID({
          id,
          vulnerability,
          performedBy: user.id,
        });
        if (!outcome) {
          return null;
        }

        emitVulnerabilityEvent(
          "vulnerability.updated",
          { previous: outcome.previous, current: outcome.current },
          eventContext,
        );
        return outcome.current;
      },

      async deleteByID(id, eventContext): Promise<VulnerabilityCatalog | null> {
        const command = {
          id,
          performedBy: requirePerformedBy(eventContext),
        } satisfies DeleteVulnerabilityByIDCommand;
        const outcome = await exposures.vulnerabilities.deleteByID(command);
        if (!outcome) {
          return null;
        }

        emitVulnerabilityEvent(
          "vulnerability.deleted",
          { vulnerability: outcome.previous },
          eventContext,
        );
        return outcome.previous;
      },
    },

    statistics: {
      getFindingStats: exposures.statistics.getFindingStats.bind(exposures.statistics),
    },
  };
}
