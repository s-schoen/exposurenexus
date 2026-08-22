import { normalizeDateToUtcStart } from "@exposurenexus/contracts/model/date";
import {
  type CreateManualFinding,
  type Finding,
  type UpdateFinding,
} from "@exposurenexus/contracts/model/finding";
import {
  type MoveObservationInput,
  ObservationSource,
  type ManualObservationInput,
  type Observation,
  type UpdateObservation,
} from "@exposurenexus/contracts/model/observation";

import {
  createDomainEventEmitter,
  type DomainEventContext,
  type DomainEventEmitter,
  type EventSubjects,
  type FindingEventPayloads,
  type ObservationEventPayloads,
} from "../lib/eventbus/events/index.js";
import { ApplicationError, isApplicationError } from "./application-error.js";
import { isForeignKeyError } from "./errors.js";

import type { FindingRepository } from "../repository/finding.js";
import type { ObservationRepository } from "../repository/observation.js";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";
import type { Logger } from "pino";

interface VulnerabilityLookupService {
  getByID(id: string): Promise<VulnerabilityCatalog | null>;
}

interface AssetLookupService {
  getByID(id: string): Promise<Asset | null>;
}

interface UserProfileLookupService {
  getByID(id: string): Promise<UserProfile | null>;
}

interface FindingServiceDependencies {
  findingRepository: Pick<
    FindingRepository,
    | "createManual"
    | "getProjectedByID"
    | "listProjected"
    | "updateByID"
    | "deleteByID"
    | "linkVulnerability"
    | "unlinkVulnerability"
  >;
  observationRepository: Pick<
    ObservationRepository,
    | "listByFindingID"
    | "createAndTouchFinding"
    | "updateAndTouchFinding"
    | "deleteAndTouchFinding"
    | "moveAndTouchFindings"
  >;
  assetService: AssetLookupService;
  userProfileService: UserProfileLookupService;
  vulnerabilityService: VulnerabilityLookupService;
  domainEventEmitter: DomainEventEmitter;
  logger: Logger;
}

function normalizeOptionalDueDate(dueDate: Date | null | undefined) {
  return dueDate ? normalizeDateToUtcStart(dueDate) : null;
}

export interface CreateManualFindingOptions {
  finding: CreateManualFinding;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateFindingOptions {
  id: string;
  finding: UpdateFinding;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface FindingVulnerabilityOptions {
  findingId: string;
  vulnerabilityId: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface FindingVulnerabilityMutationResult {
  finding: Finding;
  changed: boolean;
}

export interface CreateManualObservationOptions {
  findingId: string;
  observation: ManualObservationInput;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface CreateManualObservationResult {
  observation: Observation;
  finding: Finding;
}

export interface UpdateObservationOptions {
  findingId: string;
  observationId: string;
  observation: UpdateObservation;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface DeleteObservationOptions {
  findingId: string;
  observationId: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface MoveObservationOptions extends MoveObservationInput {
  findingId: string;
  observationId: string;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface ObservationMutationResult {
  observation: Observation;
  finding: Finding;
}

export interface MoveObservationResult {
  observation: Observation;
  sourceFinding: Finding;
  targetFinding: Finding;
}

export interface FindingService {
  listAll(): Promise<Finding[]>;
  getByID(id: string): Promise<Finding | null>;
  createManual(opts: CreateManualFindingOptions): Promise<Finding>;
  listObservations(findingId: string): Promise<Observation[] | null>;
  createManualObservation(
    opts: CreateManualObservationOptions,
  ): Promise<CreateManualObservationResult | null>;
  updateObservation(opts: UpdateObservationOptions): Promise<ObservationMutationResult | null>;
  deleteObservation(opts: DeleteObservationOptions): Promise<ObservationMutationResult | null>;
  moveObservation(opts: MoveObservationOptions): Promise<MoveObservationResult | null>;
  updateByID(opts: UpdateFindingOptions): Promise<Finding | null>;
  deleteByID(id: string, eventContext?: DomainEventContext): Promise<Finding | null>;
  linkVulnerability(
    opts: FindingVulnerabilityOptions,
  ): Promise<FindingVulnerabilityMutationResult | null>;
  unlinkVulnerability(
    opts: FindingVulnerabilityOptions,
  ): Promise<FindingVulnerabilityMutationResult | null>;
}

export function createFindingService({
  findingRepository,
  observationRepository,
  assetService,
  userProfileService,
  vulnerabilityService,
  domainEventEmitter,
  logger,
}: FindingServiceDependencies): FindingService {
  const emitFindingEvent = createDomainEventEmitter<EventSubjects<FindingEventPayloads>>(
    domainEventEmitter,
    "finding",
  );
  const emitObservationEvent = createDomainEventEmitter<EventSubjects<ObservationEventPayloads>>(
    domainEventEmitter,
    "observation",
  );

  async function mutateVulnerabilityLink(
    opts: FindingVulnerabilityOptions,
    operation: "link" | "unlink",
  ): Promise<FindingVulnerabilityMutationResult | null> {
    const [finding, vulnerability] = await Promise.all([
      findingRepository.getProjectedByID(opts.findingId),
      vulnerabilityService.getByID(opts.vulnerabilityId),
    ]);

    if (!finding) {
      return null;
    }

    if (!vulnerability) {
      throw new ApplicationError({
        code: "finding.vulnerability_link_target_missing",
        kind: "missing",
        message: `vulnerability with id ${opts.vulnerabilityId} does not exist`,
        details: { vulnerabilityId: opts.vulnerabilityId },
      });
    }

    const audit = {
      updatedAt: new Date(),
      updatedBy: opts.user.id,
    };
    const mutation =
      operation === "link"
        ? await findingRepository.linkVulnerability({
            findingId: opts.findingId,
            vulnerabilityId: opts.vulnerabilityId,
            ...audit,
          })
        : await findingRepository.unlinkVulnerability({
            findingId: opts.findingId,
            vulnerabilityId: opts.vulnerabilityId,
            ...audit,
          });
    const current = await findingRepository.getProjectedByID(opts.findingId);

    if (!current) {
      throw new ApplicationError({
        code: "finding.vulnerability_link_failed",
        kind: "unexpected",
        message: "finding disappeared while updating its catalog links",
        details: { findingId: opts.findingId, vulnerabilityId: opts.vulnerabilityId },
      });
    }

    if (mutation.changed && mutation.link) {
      emitFindingEvent(
        operation === "link" ? "finding.vulnerability.linked" : "finding.vulnerability.unlinked",
        {
          finding: current,
          vulnerability,
          link: mutation.link,
        },
        opts.eventContext,
      );
    }

    return {
      finding: current,
      changed: mutation.changed,
    };
  }

  async function safelyMutateVulnerabilityLink(
    opts: FindingVulnerabilityOptions,
    operation: "link" | "unlink",
  ): Promise<FindingVulnerabilityMutationResult | null> {
    try {
      return await mutateVulnerabilityLink(opts, operation);
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }

      logger.error(
        error,
        `failed to ${operation} vulnerability ${opts.vulnerabilityId} for finding ${opts.findingId}`,
      );
      throw new ApplicationError({
        code: "finding.vulnerability_link_failed",
        kind: "unexpected",
        message: `failed to ${operation} finding vulnerability`,
        cause: error,
        details: { findingId: opts.findingId, vulnerabilityId: opts.vulnerabilityId },
      });
    }
  }

  async function validateManualFindingRelations(finding: CreateManualFinding): Promise<void> {
    const asset = await assetService.getByID(finding.assetId);

    if (!asset) {
      throw new ApplicationError({
        code: "finding.asset_unknown",
        kind: "validation",
        message: "finding asset does not exist",
        details: { assetId: finding.assetId },
      });
    }

    for (const vulnerabilityId of finding.vulnerabilityIds) {
      const vulnerability = await vulnerabilityService.getByID(vulnerabilityId);
      if (!vulnerability) {
        throw new ApplicationError({
          code: "finding.vulnerability_unknown",
          kind: "validation",
          message: "finding vulnerability does not exist",
          details: { vulnerabilityId },
        });
      }
    }

    if (finding.assigneeId) {
      const assignee = await userProfileService.getByID(finding.assigneeId);
      if (!assignee) {
        throw new ApplicationError({
          code: "finding.assignee_unknown",
          kind: "validation",
          message: "finding assignee does not exist",
          details: { assigneeId: finding.assigneeId },
        });
      }
    }
  }

  async function createManualFinding(opts: CreateManualFindingOptions): Promise<Finding> {
    try {
      await validateManualFindingRelations(opts.finding);

      const now = new Date();
      const { observation: observationInput, vulnerabilityIds, ...findingInput } = opts.finding;
      const finding = {
        ...findingInput,
        assigneeId: findingInput.assigneeId ?? null,
        dueDate: normalizeOptionalDueDate(findingInput.dueDate),
        mitigation: findingInput.mitigation ?? null,
        createdAt: now,
        updatedAt: now,
        createdBy: opts.user.id,
        updatedBy: opts.user.id,
      };
      const observation: ManualObservationInput = observationInput ?? {};

      const created = await findingRepository.createManual({
        finding,
        observation: {
          ingestionId: null,
          source: ObservationSource.Manual,
          title: observation.title ?? finding.title,
          description: observation.description ?? null,
          evidence: observation.evidence ?? null,
          remediation: observation.remediation ?? null,
          severity: observation.severity ?? finding.severity,
          weakness: observation.weakness ?? finding.weakness,
          affectedResource: observation.affectedResource ?? finding.affectedResource,
          observedAt: observation.observedAt ?? now,
          createdAt: now,
          updatedAt: now,
          createdBy: opts.user.id,
          updatedBy: opts.user.id,
        },
        vulnerabilityIds,
      });

      emitFindingEvent("finding.created", { finding: created.projection }, opts.eventContext);
      emitObservationEvent(
        "observation.created",
        { observation: created.observation },
        opts.eventContext,
      );
      return created.projection;
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }

      logger.error(error, `failed to create manual finding for ${opts.finding.assetId}`);
      throw new ApplicationError({
        code: "finding.manual_create_failed",
        kind: "unexpected",
        message: "failed to create manual finding",
        cause: error,
        details: { assetId: opts.finding.assetId },
      });
    }
  }

  return {
    async listAll(): Promise<Finding[]> {
      try {
        return await findingRepository.listProjected();
      } catch (error) {
        logger.error(error, "failed to list findings");
        throw new ApplicationError({
          code: "finding.list_failed",
          kind: "unexpected",
          message: "failed to list findings",
          cause: error,
        });
      }
    },

    async getByID(id: string): Promise<Finding | null> {
      try {
        return await findingRepository.getProjectedByID(id);
      } catch (error) {
        logger.error(error, `failed to get finding with id ${id}`);
        throw new ApplicationError({
          code: "finding.get_failed",
          kind: "unexpected",
          message: "failed to get finding",
          cause: error,
          details: { findingId: id },
        });
      }
    },

    async createManual(opts: CreateManualFindingOptions): Promise<Finding> {
      return await createManualFinding(opts);
    },

    async listObservations(findingId: string): Promise<Observation[] | null> {
      try {
        const finding = await findingRepository.getProjectedByID(findingId);
        return finding ? await observationRepository.listByFindingID(findingId) : null;
      } catch (error) {
        logger.error(error, `failed to list observations for finding ${findingId}`);
        throw new ApplicationError({
          code: "observation.list_failed",
          kind: "unexpected",
          message: "failed to list finding observations",
          cause: error,
          details: { findingId },
        });
      }
    },

    async createManualObservation(
      opts: CreateManualObservationOptions,
    ): Promise<CreateManualObservationResult | null> {
      try {
        const input = opts.observation;
        const mutation = await observationRepository.createAndTouchFinding({
          findingId: opts.findingId,
          buildObservation(previous) {
            const now = new Date();
            return {
              findingId: opts.findingId,
              ingestionId: null,
              source: ObservationSource.Manual,
              title: input.title ?? previous.title,
              description: input.description ?? null,
              evidence: input.evidence ?? null,
              remediation: input.remediation ?? null,
              severity: input.severity ?? previous.severity,
              weakness: input.weakness ?? previous.weakness,
              affectedResource: input.affectedResource ?? previous.affectedResource,
              observedAt: input.observedAt ?? now,
              createdAt: now,
              updatedAt: now,
              createdBy: opts.user.id,
              updatedBy: opts.user.id,
            };
          },
        });
        if (!mutation) {
          return null;
        }

        emitObservationEvent(
          "observation.created",
          { observation: mutation.observation },
          opts.eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: mutation.previous, current: mutation.current },
          opts.eventContext,
        );
        return { observation: mutation.observation, finding: mutation.current };
      } catch (error) {
        logger.error(error, `failed to create observation for finding ${opts.findingId}`);
        throw new ApplicationError({
          code: "observation.create_failed",
          kind: "unexpected",
          message: "failed to create manual observation",
          cause: error,
          details: { findingId: opts.findingId },
        });
      }
    },

    async updateObservation(
      opts: UpdateObservationOptions,
    ): Promise<ObservationMutationResult | null> {
      try {
        const mutation = await observationRepository.updateAndTouchFinding({
          findingId: opts.findingId,
          observationId: opts.observationId,
          observation: {
            ...opts.observation,
            updatedAt: new Date(),
            updatedBy: opts.user.id,
          },
        });
        if (!mutation) {
          return null;
        }

        emitObservationEvent(
          "observation.updated",
          {
            previous: mutation.previousObservation,
            current: mutation.observation,
          },
          opts.eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: mutation.previous, current: mutation.current },
          opts.eventContext,
        );

        return { observation: mutation.observation, finding: mutation.current };
      } catch (error) {
        logger.error(
          error,
          `failed to update observation ${opts.observationId} for finding ${opts.findingId}`,
        );
        throw new ApplicationError({
          code: "observation.update_failed",
          kind: "unexpected",
          message: "failed to update observation",
          cause: error,
          details: { findingId: opts.findingId, observationId: opts.observationId },
        });
      }
    },

    async deleteObservation(
      opts: DeleteObservationOptions,
    ): Promise<ObservationMutationResult | null> {
      try {
        const mutation = await observationRepository.deleteAndTouchFinding({
          findingId: opts.findingId,
          observationId: opts.observationId,
          updatedAt: new Date(),
          updatedBy: opts.user.id,
        });
        if (!mutation) {
          return null;
        }

        emitObservationEvent(
          "observation.deleted",
          { observation: mutation.observation },
          opts.eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: mutation.previous, current: mutation.current },
          opts.eventContext,
        );

        return { observation: mutation.observation, finding: mutation.current };
      } catch (error) {
        logger.error(
          error,
          `failed to delete observation ${opts.observationId} for finding ${opts.findingId}`,
        );
        throw new ApplicationError({
          code: "observation.delete_failed",
          kind: "unexpected",
          message: "failed to delete observation",
          cause: error,
          details: { findingId: opts.findingId, observationId: opts.observationId },
        });
      }
    },

    async moveObservation(opts: MoveObservationOptions): Promise<MoveObservationResult | null> {
      if (opts.findingId === opts.targetFindingId) {
        throw new ApplicationError({
          code: "observation.move_same_finding",
          kind: "validation",
          message: "observation already belongs to the target finding",
          details: {
            findingId: opts.findingId,
            observationId: opts.observationId,
            targetFindingId: opts.targetFindingId,
          },
        });
      }

      try {
        const mutation = await observationRepository.moveAndTouchFindings({
          findingId: opts.findingId,
          observationId: opts.observationId,
          targetFindingId: opts.targetFindingId,
          updatedAt: new Date(),
          updatedBy: opts.user.id,
        });
        if (!mutation) {
          return null;
        }

        emitObservationEvent(
          "observation.moved",
          {
            previous: mutation.previousObservation,
            current: mutation.observation,
          },
          opts.eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: mutation.sourcePrevious, current: mutation.sourceCurrent },
          opts.eventContext,
        );
        emitFindingEvent(
          "finding.updated",
          { previous: mutation.targetPrevious, current: mutation.targetCurrent },
          opts.eventContext,
        );

        return {
          observation: mutation.observation,
          sourceFinding: mutation.sourceCurrent,
          targetFinding: mutation.targetCurrent,
        };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(
          error,
          `failed to move observation ${opts.observationId} from finding ${opts.findingId} to ${opts.targetFindingId}`,
        );
        throw new ApplicationError({
          code: "observation.move_failed",
          kind: "unexpected",
          message: "failed to move observation",
          cause: error,
          details: {
            findingId: opts.findingId,
            observationId: opts.observationId,
            targetFindingId: opts.targetFindingId,
          },
        });
      }
    },

    async updateByID(opts: UpdateFindingOptions): Promise<Finding | null> {
      try {
        const finding = await findingRepository.getProjectedByID(opts.id);

        if (!finding) {
          logger.debug(`cannot update finding ${opts.id}: not found`);
          return null;
        }

        const assigneeId = opts.finding.assigneeId;

        if (assigneeId) {
          const assignee = await userProfileService.getByID(assigneeId);

          if (!assignee) {
            throw new ApplicationError({
              code: "finding.assignee_unknown",
              kind: "validation",
              message: "finding assignee does not exist",
              details: { assigneeId, findingId: opts.id },
            });
          }
        }

        const findingUpdate = {
          ...opts.finding,
          updatedAt: new Date(),
          updatedBy: opts.user.id,
          ...(opts.finding.dueDate === undefined
            ? {}
            : { dueDate: normalizeOptionalDueDate(opts.finding.dueDate) }),
        };

        const updatedFinding = await findingRepository.updateByID(opts.id, findingUpdate);
        if (!updatedFinding) {
          return null;
        }

        const currentFinding = await findingRepository.getProjectedByID(opts.id);
        if (!currentFinding) {
          throw new Error("finding was not available after correction");
        }
        emitFindingEvent(
          "finding.updated",
          {
            previous: finding,
            current: currentFinding,
          },
          opts.eventContext,
        );

        return currentFinding;
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isForeignKeyError(error) && opts.finding.assigneeId) {
          logger.debug(error, "finding update foreign key invalid assignee");
          throw new ApplicationError({
            code: "finding.assignee_unknown",
            kind: "validation",
            message: "finding assignee does not exist",
            cause: error,
            details: { assigneeId: opts.finding.assigneeId, findingId: opts.id },
          });
        }

        logger.error(error, `failed to get finding with id ${opts.id}`);
        throw new ApplicationError({
          code: "finding.update_failed",
          kind: "unexpected",
          message: "failed to update finding",
          cause: error,
          details: { findingId: opts.id },
        });
      }
    },

    async deleteByID(id: string, eventContext: DomainEventContext = {}): Promise<Finding | null> {
      try {
        const finding = await findingRepository.getProjectedByID(id);

        if (!finding) {
          logger.debug(`cannot delete finding ${id}: not found`);
          return null;
        }

        const deleted = await findingRepository.deleteByID(id);
        if (!deleted) {
          logger.debug(`cannot delete finding ${id}: not found`);
          return null;
        }

        emitFindingEvent("finding.deleted", { finding }, eventContext);
        return finding;
      } catch (error) {
        logger.error(error, `failed to get finding with id ${id}`);
        throw new ApplicationError({
          code: "finding.delete_failed",
          kind: "unexpected",
          message: "failed to get finding",
          cause: error,
          details: { findingId: id },
        });
      }
    },

    async linkVulnerability(
      opts: FindingVulnerabilityOptions,
    ): Promise<FindingVulnerabilityMutationResult | null> {
      return await safelyMutateVulnerabilityLink(opts, "link");
    },

    async unlinkVulnerability(
      opts: FindingVulnerabilityOptions,
    ): Promise<FindingVulnerabilityMutationResult | null> {
      return await safelyMutateVulnerabilityLink(opts, "unlink");
    },
  };
}
