import { createHash } from "node:crypto";

import { normalizeDateToUtcStart } from "@exposurenexus/types/model/date";
import {
  FindingStatus,
  type CreateFinding,
  type CreateManualFinding,
  type Finding,
  type FindingInternal,
  type FindingProjection,
  type LegacyCreateFinding,
  type UpdateFinding,
} from "@exposurenexus/types/model/finding";
import {
  type MoveObservationInput,
  ObservationSource,
  type ManualObservationInput,
  type Observation,
  type UpdateObservation,
} from "@exposurenexus/types/model/observation";

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

import type { FindingPersistenceRepository } from "../repository/finding-persistence.js";
import type { FindingVulnerabilityRepository } from "../repository/finding-vulnerability.js";
import type { FindingRepository } from "../repository/finding.js";
import type { ObservationRepository } from "../repository/observation.js";
import type { Asset } from "@exposurenexus/types/model/asset";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { VulnerabilityCatalog } from "@exposurenexus/types/model/vulnerability";
import type { Logger } from "pino";

interface VulnerabilityLookupService {
  getByID(id: string): Promise<unknown>;
}

interface AssetLookupService {
  getByID(id: string): Promise<Asset | null>;
}

interface UserProfileLookupService {
  getByID(id: string): Promise<UserProfile | null>;
}

interface FindingServiceDependencies {
  findingRepository: FindingRepository;
  findingPersistenceRepository?: Pick<
    FindingPersistenceRepository,
    "getProjectedByID" | "listProjected" | "updateByID" | "deleteByID"
  >;
  manualFindingRepository?: Pick<FindingPersistenceRepository, "createManual" | "getProjectedByID">;
  findingVulnerabilityRepository?: FindingVulnerabilityRepository;
  observationRepository?: Pick<
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

function calculateFingerprint(
  assetId: string,
  vulnerabilityId: string,
  fingerprintOpt?: Record<string, string>,
): string {
  const hash = createHash("sha256");
  hash.update(vulnerabilityId);
  hash.update(assetId);
  if (fingerprintOpt) {
    hash.update(JSON.stringify(fingerprintOpt));
  }
  return hash.digest("hex");
}

function normalizeOptionalDueDate(dueDate: Date | null | undefined) {
  return dueDate ? normalizeDateToUtcStart(dueDate) : null;
}

function resolveImportedFindingStatus(
  existingStatus: FindingInternal["status"],
  importedStatus: CreateFinding["status"],
) {
  if (existingStatus === FindingStatus.Inactive) {
    return importedStatus;
  }

  return existingStatus;
}

export interface CreateFindingOptions {
  finding: LegacyCreateFinding;
  user: UserProfile;
  firstSeen?: Date;
  fingerprintOptions?: Record<string, string>;
  eventContext?: DomainEventContext;
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
  finding: FindingProjection;
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
  finding: FindingProjection;
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
  finding: FindingProjection;
}

export interface MoveObservationResult {
  observation: Observation;
  sourceFinding: FindingProjection;
  targetFinding: FindingProjection;
}

export interface CreateOrUpdateFindingResult {
  finding: Finding;
  created: boolean;
}

export interface FindingService {
  listAll(): Promise<FindingProjection[]>;
  getByID(id: string): Promise<FindingProjection | null>;
  create(opts: CreateFindingOptions): Promise<Finding>;
  createManual(opts: CreateManualFindingOptions): Promise<FindingProjection>;
  listObservations(findingId: string): Promise<Observation[] | null>;
  createManualObservation(
    opts: CreateManualObservationOptions,
  ): Promise<CreateManualObservationResult | null>;
  updateObservation(opts: UpdateObservationOptions): Promise<ObservationMutationResult | null>;
  deleteObservation(opts: DeleteObservationOptions): Promise<ObservationMutationResult | null>;
  moveObservation(opts: MoveObservationOptions): Promise<MoveObservationResult | null>;
  updateByID(opts: UpdateFindingOptions): Promise<FindingProjection | null>;
  createOrUpdate(opts: CreateFindingOptions): Promise<CreateOrUpdateFindingResult>;
  deleteByID(id: string, eventContext?: DomainEventContext): Promise<FindingProjection | null>;
  linkVulnerability(
    opts: FindingVulnerabilityOptions,
  ): Promise<FindingVulnerabilityMutationResult | null>;
  unlinkVulnerability(
    opts: FindingVulnerabilityOptions,
  ): Promise<FindingVulnerabilityMutationResult | null>;
}

export function createFindingService({
  findingRepository,
  findingPersistenceRepository,
  manualFindingRepository,
  findingVulnerabilityRepository,
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

  async function extendWithVulnerability(
    intFinding: FindingInternal,
    knownVulnerability?: Finding["vulnerability"],
  ): Promise<Finding> {
    const vuln = (knownVulnerability ??
      (await vulnerabilityService.getByID(intFinding.vulnerabilityId))) as
      | Finding["vulnerability"]
      | null;
    if (!vuln) {
      logger.error(
        `finding ${intFinding.id} references unknown vulnerability ${intFinding.vulnerabilityId}`,
      );
      throw new Error(
        `finding ${intFinding.id} references unknown vulnerability ${intFinding.vulnerabilityId}`,
      );
    }
    return {
      ...intFinding,
      vulnerability: vuln,
    };
  }

  async function mutateVulnerabilityLink(
    opts: FindingVulnerabilityOptions,
    operation: "link" | "unlink",
  ): Promise<FindingVulnerabilityMutationResult | null> {
    if (!findingPersistenceRepository || !findingVulnerabilityRepository) {
      throw new ApplicationError({
        code: "finding.vulnerability_link_failed",
        kind: "unexpected",
        message: "finding vulnerability links are unavailable",
        details: { findingId: opts.findingId, vulnerabilityId: opts.vulnerabilityId },
      });
    }

    const [finding, vulnerability] = await Promise.all([
      findingPersistenceRepository.getProjectedByID(opts.findingId),
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
        ? await findingVulnerabilityRepository.linkAndTouchFinding(
            opts.findingId,
            opts.vulnerabilityId,
            audit,
          )
        : await findingVulnerabilityRepository.unlinkAndTouchFinding(
            opts.findingId,
            opts.vulnerabilityId,
            audit,
          );
    const current = await findingPersistenceRepository.getProjectedByID(opts.findingId);

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
          vulnerability: vulnerability as VulnerabilityCatalog,
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

  async function validateCreateFindingRelations(
    finding: LegacyCreateFinding,
  ): Promise<Finding["vulnerability"]> {
    const [asset, vulnerability] = await Promise.all([
      assetService.getByID(finding.assetId),
      vulnerabilityService.getByID(finding.vulnerabilityId),
    ]);

    if (!asset) {
      throw new ApplicationError({
        code: "finding.asset_unknown",
        kind: "validation",
        message: "finding asset does not exist",
        details: { assetId: finding.assetId },
      });
    }

    if (!vulnerability) {
      throw new ApplicationError({
        code: "finding.vulnerability_unknown",
        kind: "validation",
        message: "finding vulnerability does not exist",
        details: { vulnerabilityId: finding.vulnerabilityId },
      });
    }

    const assigneeId = finding.assigneeId ?? null;
    if (assigneeId) {
      const assignee = await userProfileService.getByID(assigneeId);

      if (!assignee) {
        throw new ApplicationError({
          code: "finding.assignee_unknown",
          kind: "validation",
          message: "finding assignee does not exist",
          details: { assigneeId },
        });
      }
    }

    return vulnerability as Finding["vulnerability"];
  }

  async function createFinding(opts: CreateFindingOptions): Promise<Finding> {
    try {
      const now = new Date();
      const assigneeId = opts.finding.assigneeId ?? null;
      const dueDate = normalizeOptionalDueDate(opts.finding.dueDate);
      const vulnerability = await validateCreateFindingRelations(opts.finding);

      const created = await findingRepository.create({
        ...opts.finding,
        createdAt: now,
        updatedAt: now,
        createdBy: opts.user.id,
        updatedBy: opts.user.id,
        assigneeId,
        dueDate,
        firstSeen: opts.firstSeen ?? now,
        lastSeen: opts.firstSeen ?? now,
        fingerprint: calculateFingerprint(
          opts.finding.assetId,
          opts.finding.vulnerabilityId,
          opts.fingerprintOptions,
        ),
      });

      const createdFinding = await extendWithVulnerability(created, vulnerability);
      emitFindingEvent("finding.created", { finding: createdFinding }, opts.eventContext);
      return createdFinding;
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }

      if (isForeignKeyError(error)) {
        logger.debug(error, "finding create foreign key invalid relation");
        throw new ApplicationError({
          code: "finding.related_resource_unknown",
          kind: "validation",
          message: "finding references an unknown related resource",
          cause: error,
          details: {
            assetId: opts.finding.assetId,
            vulnerabilityId: opts.finding.vulnerabilityId,
            assigneeId: opts.finding.assigneeId ?? null,
          },
        });
      }

      logger.error(error, `failed to create new finding for ${opts.finding.vulnerabilityId}`);
      throw new ApplicationError({
        code: "finding.create_failed",
        kind: "unexpected",
        message: "failed to create finding",
        cause: error,
        details: {
          assetId: opts.finding.assetId,
          vulnerabilityId: opts.finding.vulnerabilityId,
        },
      });
    }
  }

  async function validateManualFindingRelations(finding: CreateManualFinding): Promise<void> {
    const [asset, vulnerabilities] = await Promise.all([
      assetService.getByID(finding.assetId),
      Promise.all(finding.vulnerabilityIds.map((id) => vulnerabilityService.getByID(id))),
    ]);

    if (!asset) {
      throw new ApplicationError({
        code: "finding.asset_unknown",
        kind: "validation",
        message: "finding asset does not exist",
        details: { assetId: finding.assetId },
      });
    }

    for (const [index, vulnerability] of vulnerabilities.entries()) {
      if (!vulnerability) {
        const vulnerabilityId = finding.vulnerabilityIds[index];
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

  async function createManualFinding(opts: CreateManualFindingOptions): Promise<FindingProjection> {
    if (!manualFindingRepository) {
      throw new ApplicationError({
        code: "finding.manual_create_unavailable",
        kind: "unexpected",
        message: "manual finding creation is unavailable",
      });
    }

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

      const created = await manualFindingRepository.createManual({
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

      const createdFinding = await manualFindingRepository.getProjectedByID(created.finding.id);
      if (!createdFinding) {
        throw new Error("manual finding was not available after creation");
      }

      emitFindingEvent("finding.created", { finding: createdFinding }, opts.eventContext);
      return createdFinding;
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
    async listAll(): Promise<FindingProjection[]> {
      try {
        if (findingPersistenceRepository) {
          return await findingPersistenceRepository.listProjected();
        }

        const findingsRaw = await findingRepository.list();
        const findings: Array<Finding> = [];

        for (const finding of findingsRaw) {
          findings.push(await extendWithVulnerability(finding));
        }
        return findings as unknown as FindingProjection[];
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

    async getByID(id: string): Promise<FindingProjection | null> {
      try {
        if (findingPersistenceRepository) {
          return await findingPersistenceRepository.getProjectedByID(id);
        }

        const finding = await findingRepository.getByID(id);
        if (!finding) {
          logger.debug(`finding with id ${id} not found`);
          return null;
        }

        return (await extendWithVulnerability(finding)) as unknown as FindingProjection;
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

    async create(opts: CreateFindingOptions): Promise<Finding> {
      return await createFinding(opts);
    },

    async createManual(opts: CreateManualFindingOptions): Promise<FindingProjection> {
      return await createManualFinding(opts);
    },

    async listObservations(findingId: string): Promise<Observation[] | null> {
      if (!findingPersistenceRepository || !observationRepository) {
        throw new ApplicationError({
          code: "observation.list_failed",
          kind: "unexpected",
          message: "finding observations are unavailable",
          details: { findingId },
        });
      }

      try {
        const finding = await findingPersistenceRepository.getProjectedByID(findingId);
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
      if (!observationRepository) {
        throw new ApplicationError({
          code: "observation.create_failed",
          kind: "unexpected",
          message: "manual observation creation is unavailable",
          details: { findingId: opts.findingId },
        });
      }

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
      if (!observationRepository) {
        throw new ApplicationError({
          code: "observation.update_failed",
          kind: "unexpected",
          message: "observation correction is unavailable",
          details: { findingId: opts.findingId, observationId: opts.observationId },
        });
      }

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
      if (!observationRepository) {
        throw new ApplicationError({
          code: "observation.delete_failed",
          kind: "unexpected",
          message: "observation deletion is unavailable",
          details: { findingId: opts.findingId, observationId: opts.observationId },
        });
      }

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
      if (!observationRepository) {
        throw new ApplicationError({
          code: "observation.move_failed",
          kind: "unexpected",
          message: "observation move is unavailable",
          details: {
            findingId: opts.findingId,
            observationId: opts.observationId,
            targetFindingId: opts.targetFindingId,
          },
        });
      }

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

    async updateByID(opts: UpdateFindingOptions): Promise<FindingProjection | null> {
      if (!findingPersistenceRepository) {
        throw new ApplicationError({
          code: "finding.update_failed",
          kind: "unexpected",
          message: "finding correction is unavailable",
          details: { findingId: opts.id },
        });
      }

      try {
        const finding = await findingPersistenceRepository.getProjectedByID(opts.id);

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

        const updatedFinding = await findingPersistenceRepository.updateByID(
          opts.id,
          findingUpdate,
        );
        if (!updatedFinding) {
          return null;
        }

        const currentFinding = await findingPersistenceRepository.getProjectedByID(opts.id);
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

    async createOrUpdate(opts: CreateFindingOptions): Promise<CreateOrUpdateFindingResult> {
      const fingerprint = calculateFingerprint(
        opts.finding.assetId,
        opts.finding.vulnerabilityId,
        opts.fingerprintOptions,
      );

      try {
        const finding = await findingRepository.getByFingerprint(fingerprint);
        if (finding) {
          const updatedObservation = {
            ...finding,
            status: resolveImportedFindingStatus(finding.status, opts.finding.status),
            lastSeen: new Date(),
          };
          const updatedFinding = await findingRepository.updateByID(finding.id, updatedObservation);
          const previousFinding = await extendWithVulnerability(finding);
          const currentFinding = await extendWithVulnerability(updatedFinding);
          emitFindingEvent(
            "finding.updated",
            {
              previous: previousFinding,
              current: currentFinding,
            },
            opts.eventContext,
          );
          return {
            finding: currentFinding,
            created: false,
          };
        }

        return {
          finding: await createFinding(opts),
          created: true,
        };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(
          error,
          `failed to create or update finding for ${opts.finding.vulnerabilityId}`,
        );
        throw new ApplicationError({
          code: "finding.create_or_update_failed",
          kind: "unexpected",
          message: "failed to create or update finding",
          cause: error,
          details: {
            assetId: opts.finding.assetId,
            vulnerabilityId: opts.finding.vulnerabilityId,
          },
        });
      }
    },

    async deleteByID(
      id: string,
      eventContext: DomainEventContext = {},
    ): Promise<FindingProjection | null> {
      try {
        if (findingPersistenceRepository) {
          const finding = await findingPersistenceRepository.getProjectedByID(id);

          if (!finding) {
            logger.debug(`cannot delete finding ${id}: not found`);
            return null;
          }

          const deleted = await findingPersistenceRepository.deleteByID(id);
          if (!deleted) {
            logger.debug(`cannot delete finding ${id}: not found`);
            return null;
          }

          emitFindingEvent("finding.deleted", { finding }, eventContext);
          return finding;
        }

        const finding = await findingRepository.deleteByID(id);

        if (!finding) {
          logger.debug(`cannot delete finding ${id}: not found`);
          return null;
        }

        const deletedFinding = (await extendWithVulnerability(
          finding,
        )) as unknown as FindingProjection;
        emitFindingEvent("finding.deleted", { finding: deletedFinding }, eventContext);
        return deletedFinding;
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
      return await mutateVulnerabilityLink(opts, "link");
    },

    async unlinkVulnerability(
      opts: FindingVulnerabilityOptions,
    ): Promise<FindingVulnerabilityMutationResult | null> {
      return await mutateVulnerabilityLink(opts, "unlink");
    },
  };
}
