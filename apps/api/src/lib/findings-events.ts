import { createDomainEventEmitter } from "./eventbus/events/index.js";

import type {
  DomainEventContext,
  DomainEventEmitter,
  EventSubjects,
  FindingEventPayloads,
  ObservationEventPayloads,
} from "./eventbus/events/index.js";
import type {
  CreateManualFindingCommand,
  CreateManualObservationCommand,
  DeleteFindingByIDCommand,
  DeleteObservationCommand,
  Findings,
  FindingVulnerabilityMutationCommand,
  MoveObservationCommand,
  UpdateFindingByIDCommand,
  UpdateObservationCommand,
} from "@exposurenexus/backend/findings";
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
  listAll: Findings["listAll"];
  getByID: Findings["getByID"];
  createManual(options: CreateApiFindingOptions): Promise<Finding>;
  listObservations: Findings["listObservations"];
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

function requirePerformedBy(eventContext: DomainEventContext | undefined): string {
  if (!eventContext?.actor) {
    throw new TypeError("exposure mutations require an authenticated actor");
  }

  return eventContext.actor;
}

export function decorateFindingsWithEvents(
  findings: Findings,
  domainEventEmitter: DomainEventEmitter,
): ApiFindingOperations {
  const emitFindingEvent = createDomainEventEmitter<EventSubjects<FindingEventPayloads>>(
    domainEventEmitter,
    "finding",
  );
  const emitObservationEvent = createDomainEventEmitter<EventSubjects<ObservationEventPayloads>>(
    domainEventEmitter,
    "observation",
  );
  return {
    listAll: findings.listAll.bind(findings),
    getByID: findings.getByID.bind(findings),
    listObservations: findings.listObservations.bind(findings),

    async createManual({ finding, user, eventContext }): Promise<Finding> {
      const command: CreateManualFindingCommand = {
        finding,
        performedBy: user.id,
      };
      const outcome = await findings.createManual(command);
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
      const outcome = await findings.createManualObservation(command);
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
      const outcome = await findings.updateObservation(command);
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
      const outcome = await findings.deleteObservation(command);
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
      const outcome = await findings.moveObservation(command);
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
      const outcome = await findings.updateByID(command);
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
      const outcome = await findings.deleteByID(command);
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
      const outcome = await findings.linkVulnerability(command);
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
      const outcome = await findings.unlinkVulnerability(command);
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
  };
}
