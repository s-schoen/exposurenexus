import { normalizeDateToUtcStart } from "@exposurenexus/contracts/model/date";
import {
  type CreateManualFinding,
  type Finding,
  type UpdateFinding,
} from "@exposurenexus/contracts/model/finding";
import {
  type ManualObservationInput,
  ObservationSource,
  type Observation,
  type UpdateObservation,
} from "@exposurenexus/contracts/model/observation";

import { ApplicationError, isApplicationError } from "../application-error.js";
import { isForeignKeyError } from "../database-error.js";

import type { AssetInventory } from "../assets/assets.js";
import type { DatabaseExecutor } from "../database/executor.js";
import type { Database } from "../database/index.js";
import type {
  CreateFindingRecord,
  FindingRecord,
  UpdateFindingRecord,
} from "./finding-persistence.js";
import type {
  FindingVulnerabilityMutation,
  FindingVulnerabilityMutationInput,
} from "./finding-vulnerability-persistence.js";
import type {
  CreateObservationAndTouchFindingInput,
  CreateObservationAndTouchFindingResult,
  CreateObservationRecord,
  DeleteObservationAndTouchFindingInput,
  DeleteObservationAndTouchFindingResult,
  MoveObservationAndTouchFindingsInput,
  MoveObservationAndTouchFindingsResult,
  ObservationRecord,
  UpdateObservationAndTouchFindingInput,
  UpdateObservationAndTouchFindingResult,
} from "./observation-persistence.js";
import type { FindingVulnerabilityLink } from "@exposurenexus/contracts/model/finding-vulnerability";
import type { VulnerabilityCatalog } from "@exposurenexus/contracts/model/vulnerability";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

interface FindingProjection {
  listFindingProjections(database: DatabaseExecutor): Promise<Finding[]>;
  getFindingProjectionByID(database: DatabaseExecutor, id: string): Promise<Finding | null>;
}

interface FindingPersistence {
  insertFinding(database: DatabaseExecutor, finding: CreateFindingRecord): Promise<FindingRecord>;
  lockFinding(database: DatabaseExecutor, id: string): Promise<FindingRecord | null>;
  updateFinding(
    database: DatabaseExecutor,
    id: string,
    finding: UpdateFindingRecord,
  ): Promise<FindingRecord | null>;
  deleteFinding(database: DatabaseExecutor, id: string): Promise<FindingRecord | null>;
}

interface ObservationPersistence {
  listObservations(database: DatabaseExecutor, findingId: string): Promise<ObservationRecord[]>;
  insertObservation(
    database: DatabaseExecutor,
    observation: CreateObservationRecord,
  ): Promise<ObservationRecord>;
  createObservationAndTouchFinding(
    database: DatabaseExecutor,
    input: CreateObservationAndTouchFindingInput,
  ): Promise<CreateObservationAndTouchFindingResult | null>;
  updateObservationAndTouchFinding(
    database: DatabaseExecutor,
    input: UpdateObservationAndTouchFindingInput,
  ): Promise<UpdateObservationAndTouchFindingResult | null>;
  deleteObservationAndTouchFinding(
    database: DatabaseExecutor,
    input: DeleteObservationAndTouchFindingInput,
  ): Promise<DeleteObservationAndTouchFindingResult | null>;
  moveObservationAndTouchFindings(
    database: DatabaseExecutor,
    input: MoveObservationAndTouchFindingsInput,
  ): Promise<MoveObservationAndTouchFindingsResult | null>;
}

interface FindingVulnerabilityPersistence {
  insertLinks(
    database: DatabaseExecutor,
    findingId: string,
    vulnerabilityIds: readonly string[],
  ): Promise<FindingVulnerabilityLink[]>;
  linkVulnerability(
    database: DatabaseExecutor,
    input: FindingVulnerabilityMutationInput,
  ): Promise<FindingVulnerabilityMutation>;
  unlinkVulnerability(
    database: DatabaseExecutor,
    input: FindingVulnerabilityMutationInput,
  ): Promise<FindingVulnerabilityMutation>;
}

interface VulnerabilityPersistence {
  getVulnerabilityByID(
    database: DatabaseExecutor,
    id: string,
  ): Promise<VulnerabilityCatalog | null>;
}

interface UserProfileLookup {
  getByID(database: DatabaseExecutor, id: string): Promise<object | null>;
}

export interface CreateManualFindingCommand {
  finding: CreateManualFinding;
  performedBy: string;
}

export interface UpdateFindingByIDCommand {
  id: string;
  finding: UpdateFinding;
  performedBy: string;
}

export interface DeleteFindingByIDCommand {
  id: string;
  performedBy: string;
}

export interface CreateManualObservationCommand {
  findingId: string;
  observation: ManualObservationInput;
  performedBy: string;
}

export interface UpdateObservationCommand {
  findingId: string;
  observationId: string;
  observation: UpdateObservation;
  performedBy: string;
}

export interface DeleteObservationCommand {
  findingId: string;
  observationId: string;
  performedBy: string;
}

export interface MoveObservationCommand {
  findingId: string;
  observationId: string;
  targetFindingId: string;
  performedBy: string;
}

export interface FindingVulnerabilityMutationCommand {
  findingId: string;
  vulnerabilityId: string;
  performedBy: string;
}

export interface FindingCreatedOutcome {
  current: Finding;
  observation: Observation;
  performedBy: string;
}

export interface FindingUpdatedOutcome {
  previous: Finding;
  current: Finding;
  performedBy: string;
}

export interface FindingDeletedOutcome {
  previous: Finding;
  performedBy: string;
}

export interface ObservationCreatedOutcome {
  observation: Observation;
  previousFinding: Finding;
  currentFinding: Finding;
  performedBy: string;
}

export interface ObservationUpdatedOutcome {
  previousObservation: Observation;
  observation: Observation;
  previousFinding: Finding;
  currentFinding: Finding;
  performedBy: string;
}

export interface ObservationDeletedOutcome {
  observation: Observation;
  previousFinding: Finding;
  currentFinding: Finding;
  performedBy: string;
}

export interface ObservationMovedOutcome {
  previousObservation: Observation;
  observation: Observation;
  sourcePrevious: Finding;
  sourceCurrent: Finding;
  targetPrevious: Finding;
  targetCurrent: Finding;
  performedBy: string;
}

export interface FindingVulnerabilityMutationOutcome {
  finding: Finding;
  vulnerability: VulnerabilityCatalog;
  link: FindingVulnerabilityLink | null;
  changed: boolean;
  performedBy: string;
}

export interface ExposureFindings {
  listAll(): Promise<Finding[]>;
  getByID(id: string): Promise<Finding | null>;
  createManual(command: CreateManualFindingCommand): Promise<FindingCreatedOutcome>;
  listObservations(findingId: string): Promise<Observation[] | null>;
  createManualObservation(
    command: CreateManualObservationCommand,
  ): Promise<ObservationCreatedOutcome | null>;
  updateObservation(command: UpdateObservationCommand): Promise<ObservationUpdatedOutcome | null>;
  deleteObservation(command: DeleteObservationCommand): Promise<ObservationDeletedOutcome | null>;
  moveObservation(command: MoveObservationCommand): Promise<ObservationMovedOutcome | null>;
  updateByID(command: UpdateFindingByIDCommand): Promise<FindingUpdatedOutcome | null>;
  deleteByID(command: DeleteFindingByIDCommand): Promise<FindingDeletedOutcome | null>;
  linkVulnerability(
    command: FindingVulnerabilityMutationCommand,
  ): Promise<FindingVulnerabilityMutationOutcome | null>;
  unlinkVulnerability(
    command: FindingVulnerabilityMutationCommand,
  ): Promise<FindingVulnerabilityMutationOutcome | null>;
}

interface FindingDependencies {
  database: Kysely<Database>;
  findingProjection: FindingProjection;
  findingPersistence: FindingPersistence;
  observationPersistence: ObservationPersistence;
  findingVulnerabilityPersistence: FindingVulnerabilityPersistence;
  vulnerabilityPersistence: VulnerabilityPersistence;
  assetInventory: Pick<AssetInventory, "getByID">;
  userProfileLookup: UserProfileLookup;
  logger: Logger;
}

type CreateManualObservationRecord = Omit<CreateObservationRecord, "findingId">;

interface CreateManualFindingPersistenceInput {
  finding: CreateFindingRecord;
  observation: CreateManualObservationRecord;
  vulnerabilityIds: readonly string[];
}

function normalizeOptionalDueDate(dueDate: Date | null | undefined): Date | null {
  return dueDate ? normalizeDateToUtcStart(dueDate) : null;
}

async function requireAuditActor(
  userProfileLookup: UserProfileLookup,
  database: DatabaseExecutor,
  performedBy: string,
): Promise<void> {
  if (!(await userProfileLookup.getByID(database, performedBy))) {
    throw new Error(`finding audit actor ${performedBy} does not exist`);
  }
}

async function getVulnerabilityForFinding(
  vulnerabilityPersistence: VulnerabilityPersistence,
  database: DatabaseExecutor,
  id: string,
): Promise<VulnerabilityCatalog | null> {
  try {
    return await vulnerabilityPersistence.getVulnerabilityByID(database, id);
  } catch (error) {
    throw new ApplicationError({
      code: "vulnerability.get_failed",
      kind: "unexpected",
      message: "failed to get vulnerability",
      cause: error,
      details: { vulnerabilityId: id },
    });
  }
}

export function createFindings({
  database,
  findingProjection,
  findingPersistence,
  observationPersistence,
  findingVulnerabilityPersistence,
  vulnerabilityPersistence,
  assetInventory,
  userProfileLookup,
  logger,
}: FindingDependencies): ExposureFindings {
  async function validateManualFindingRelations(finding: CreateManualFinding): Promise<void> {
    let asset: Awaited<ReturnType<AssetInventory["getByID"]>>;
    try {
      asset = await assetInventory.getByID(finding.assetId);
    } catch (error) {
      if (isApplicationError(error) && error.code === "asset.get_failed") {
        throw error.cause instanceof Error ? error.cause : new Error(error.message);
      }

      throw error;
    }

    if (!asset) {
      throw new ApplicationError({
        code: "finding.asset_unknown",
        kind: "validation",
        message: "finding asset does not exist",
        details: { assetId: finding.assetId },
      });
    }

    for (const vulnerabilityId of finding.vulnerabilityIds) {
      const vulnerability = await getVulnerabilityForFinding(
        vulnerabilityPersistence,
        database,
        vulnerabilityId,
      );
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
      const assignee = await userProfileLookup.getByID(database, finding.assigneeId);
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

  async function mutateVulnerabilityLink(
    command: FindingVulnerabilityMutationCommand,
    operation: "link" | "unlink",
  ): Promise<FindingVulnerabilityMutationOutcome | null> {
    return await database.transaction().execute(async (transaction) => {
      const [finding, vulnerability] = await Promise.all([
        findingProjection.getFindingProjectionByID(transaction, command.findingId),
        getVulnerabilityForFinding(vulnerabilityPersistence, transaction, command.vulnerabilityId),
      ]);

      if (!finding) {
        return null;
      }

      if (!vulnerability) {
        throw new ApplicationError({
          code: "finding.vulnerability_link_target_missing",
          kind: "missing",
          message: `vulnerability with id ${command.vulnerabilityId} does not exist`,
          details: { vulnerabilityId: command.vulnerabilityId },
        });
      }

      await requireAuditActor(userProfileLookup, transaction, command.performedBy);
      const audit = {
        updatedAt: new Date(),
        updatedBy: command.performedBy,
      };
      const mutation =
        operation === "link"
          ? await findingVulnerabilityPersistence.linkVulnerability(transaction, {
              findingId: command.findingId,
              vulnerabilityId: command.vulnerabilityId,
              ...audit,
            })
          : await findingVulnerabilityPersistence.unlinkVulnerability(transaction, {
              findingId: command.findingId,
              vulnerabilityId: command.vulnerabilityId,
              ...audit,
            });
      const current = await findingProjection.getFindingProjectionByID(
        transaction,
        command.findingId,
      );

      if (!current) {
        throw new ApplicationError({
          code: "finding.vulnerability_link_failed",
          kind: "unexpected",
          message: "finding disappeared while updating its catalog links",
          details: { findingId: command.findingId, vulnerabilityId: command.vulnerabilityId },
        });
      }

      return {
        finding: current,
        vulnerability,
        link: mutation.link,
        changed: mutation.changed,
        performedBy: command.performedBy,
      };
    });
  }

  async function safelyMutateVulnerabilityLink(
    command: FindingVulnerabilityMutationCommand,
    operation: "link" | "unlink",
  ): Promise<FindingVulnerabilityMutationOutcome | null> {
    try {
      return await mutateVulnerabilityLink(command, operation);
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }

      logger.error(
        error,
        `failed to ${operation} vulnerability ${command.vulnerabilityId} for finding ${command.findingId}`,
      );
      throw new ApplicationError({
        code: "finding.vulnerability_link_failed",
        kind: "unexpected",
        message: `failed to ${operation} finding vulnerability`,
        cause: error,
        details: { findingId: command.findingId, vulnerabilityId: command.vulnerabilityId },
      });
    }
  }

  return {
    async listAll(): Promise<Finding[]> {
      try {
        return await findingProjection.listFindingProjections(database);
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
        return await findingProjection.getFindingProjectionByID(database, id);
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

    async createManual(command: CreateManualFindingCommand): Promise<FindingCreatedOutcome> {
      try {
        await validateManualFindingRelations(command.finding);

        const now = new Date();
        const {
          observation: observationInput,
          vulnerabilityIds,
          ...findingInput
        } = command.finding;
        const finding: CreateFindingRecord = {
          ...findingInput,
          assigneeId: findingInput.assigneeId ?? null,
          dueDate: normalizeOptionalDueDate(findingInput.dueDate),
          mitigation: findingInput.mitigation ?? null,
          createdAt: now,
          updatedAt: now,
          createdBy: command.performedBy,
          updatedBy: command.performedBy,
        };
        const observation: CreateManualObservationRecord = {
          ingestionId: null,
          source: ObservationSource.Manual,
          title: observationInput?.title ?? finding.title,
          description: observationInput?.description ?? null,
          evidence: observationInput?.evidence ?? null,
          remediation: observationInput?.remediation ?? null,
          severity: observationInput?.severity ?? finding.severity,
          weakness: observationInput?.weakness ?? finding.weakness,
          affectedResource: observationInput?.affectedResource ?? finding.affectedResource,
          observedAt: observationInput?.observedAt ?? now,
          createdAt: now,
          updatedAt: now,
          createdBy: command.performedBy,
          updatedBy: command.performedBy,
        };
        const input: CreateManualFindingPersistenceInput = {
          finding,
          observation,
          vulnerabilityIds,
        };

        const created = await database.transaction().execute(async (transaction) => {
          await requireAuditActor(userProfileLookup, transaction, command.performedBy);
          const createdFinding = await findingPersistence.insertFinding(transaction, input.finding);
          const createdObservation = await observationPersistence.insertObservation(transaction, {
            ...input.observation,
            findingId: createdFinding.id,
          });
          const links = await findingVulnerabilityPersistence.insertLinks(
            transaction,
            createdFinding.id,
            input.vulnerabilityIds,
          );
          const projection = await findingProjection.getFindingProjectionByID(
            transaction,
            createdFinding.id,
          );
          if (!projection) {
            throw new Error("created manual finding was not available as a projection");
          }

          return {
            finding: createdFinding,
            observation: createdObservation,
            links,
            projection,
          };
        });

        return {
          current: created.projection,
          observation: created.observation,
          performedBy: command.performedBy,
        };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(error, `failed to create manual finding for ${command.finding.assetId}`);
        throw new ApplicationError({
          code: "finding.manual_create_failed",
          kind: "unexpected",
          message: "failed to create manual finding",
          cause: error,
          details: { assetId: command.finding.assetId },
        });
      }
    },

    async listObservations(findingId: string): Promise<Observation[] | null> {
      try {
        const finding = await findingProjection.getFindingProjectionByID(database, findingId);
        return finding ? await observationPersistence.listObservations(database, findingId) : null;
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
      command: CreateManualObservationCommand,
    ): Promise<ObservationCreatedOutcome | null> {
      try {
        const input = command.observation;
        const mutation = await database.transaction().execute(async (transaction) => {
          await requireAuditActor(userProfileLookup, transaction, command.performedBy);
          return await observationPersistence.createObservationAndTouchFinding(transaction, {
            findingId: command.findingId,
            buildObservation(previous) {
              const now = new Date();
              return {
                findingId: command.findingId,
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
                createdBy: command.performedBy,
                updatedBy: command.performedBy,
              };
            },
          });
        });
        if (!mutation) {
          return null;
        }

        return {
          observation: mutation.observation,
          previousFinding: mutation.previous,
          currentFinding: mutation.current,
          performedBy: command.performedBy,
        };
      } catch (error) {
        logger.error(error, `failed to create observation for finding ${command.findingId}`);
        throw new ApplicationError({
          code: "observation.create_failed",
          kind: "unexpected",
          message: "failed to create manual observation",
          cause: error,
          details: { findingId: command.findingId },
        });
      }
    },

    async updateObservation(
      command: UpdateObservationCommand,
    ): Promise<ObservationUpdatedOutcome | null> {
      try {
        const mutation = await database.transaction().execute(async (transaction) => {
          await requireAuditActor(userProfileLookup, transaction, command.performedBy);
          return await observationPersistence.updateObservationAndTouchFinding(transaction, {
            findingId: command.findingId,
            observationId: command.observationId,
            observation: {
              ...command.observation,
              updatedAt: new Date(),
              updatedBy: command.performedBy,
            },
          });
        });
        if (!mutation) {
          return null;
        }

        return {
          previousObservation: mutation.previousObservation,
          observation: mutation.observation,
          previousFinding: mutation.previous,
          currentFinding: mutation.current,
          performedBy: command.performedBy,
        };
      } catch (error) {
        logger.error(
          error,
          `failed to update observation ${command.observationId} for finding ${command.findingId}`,
        );
        throw new ApplicationError({
          code: "observation.update_failed",
          kind: "unexpected",
          message: "failed to update observation",
          cause: error,
          details: { findingId: command.findingId, observationId: command.observationId },
        });
      }
    },

    async deleteObservation(
      command: DeleteObservationCommand,
    ): Promise<ObservationDeletedOutcome | null> {
      try {
        const mutation = await database.transaction().execute(async (transaction) => {
          await requireAuditActor(userProfileLookup, transaction, command.performedBy);
          return await observationPersistence.deleteObservationAndTouchFinding(transaction, {
            findingId: command.findingId,
            observationId: command.observationId,
            updatedAt: new Date(),
            updatedBy: command.performedBy,
          });
        });
        if (!mutation) {
          return null;
        }

        return {
          observation: mutation.observation,
          previousFinding: mutation.previous,
          currentFinding: mutation.current,
          performedBy: command.performedBy,
        };
      } catch (error) {
        logger.error(
          error,
          `failed to delete observation ${command.observationId} for finding ${command.findingId}`,
        );
        throw new ApplicationError({
          code: "observation.delete_failed",
          kind: "unexpected",
          message: "failed to delete observation",
          cause: error,
          details: { findingId: command.findingId, observationId: command.observationId },
        });
      }
    },

    async moveObservation(
      command: MoveObservationCommand,
    ): Promise<ObservationMovedOutcome | null> {
      if (command.findingId === command.targetFindingId) {
        throw new ApplicationError({
          code: "observation.move_same_finding",
          kind: "validation",
          message: "observation already belongs to the target finding",
          details: {
            findingId: command.findingId,
            observationId: command.observationId,
            targetFindingId: command.targetFindingId,
          },
        });
      }

      try {
        const mutation = await database.transaction().execute(async (transaction) => {
          await requireAuditActor(userProfileLookup, transaction, command.performedBy);
          return await observationPersistence.moveObservationAndTouchFindings(transaction, {
            findingId: command.findingId,
            observationId: command.observationId,
            targetFindingId: command.targetFindingId,
            updatedAt: new Date(),
            updatedBy: command.performedBy,
          });
        });
        if (!mutation) {
          return null;
        }

        return {
          previousObservation: mutation.previousObservation,
          observation: mutation.observation,
          sourcePrevious: mutation.sourcePrevious,
          sourceCurrent: mutation.sourceCurrent,
          targetPrevious: mutation.targetPrevious,
          targetCurrent: mutation.targetCurrent,
          performedBy: command.performedBy,
        };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        logger.error(
          error,
          `failed to move observation ${command.observationId} from finding ${command.findingId} to ${command.targetFindingId}`,
        );
        throw new ApplicationError({
          code: "observation.move_failed",
          kind: "unexpected",
          message: "failed to move observation",
          cause: error,
          details: {
            findingId: command.findingId,
            observationId: command.observationId,
            targetFindingId: command.targetFindingId,
          },
        });
      }
    },

    async updateByID(command: UpdateFindingByIDCommand): Promise<FindingUpdatedOutcome | null> {
      try {
        const updated = await database.transaction().execute(async (transaction) => {
          const lockedFinding = await findingPersistence.lockFinding(transaction, command.id);
          if (!lockedFinding) {
            return null;
          }

          const previous = await findingProjection.getFindingProjectionByID(
            transaction,
            command.id,
          );
          if (!previous) {
            return null;
          }

          if (command.finding.assigneeId) {
            const assignee = await userProfileLookup.getByID(
              transaction,
              command.finding.assigneeId,
            );
            if (!assignee) {
              throw new ApplicationError({
                code: "finding.assignee_unknown",
                kind: "validation",
                message: "finding assignee does not exist",
                details: { assigneeId: command.finding.assigneeId, findingId: command.id },
              });
            }
          }
          await requireAuditActor(userProfileLookup, transaction, command.performedBy);

          const findingUpdate: UpdateFindingRecord = {
            ...command.finding,
            updatedAt: new Date(),
            updatedBy: command.performedBy,
            ...(command.finding.dueDate === undefined
              ? {}
              : { dueDate: normalizeOptionalDueDate(command.finding.dueDate) }),
          };
          const updatedFinding = await findingPersistence.updateFinding(
            transaction,
            command.id,
            findingUpdate,
          );
          if (!updatedFinding) {
            return null;
          }

          const current = await findingProjection.getFindingProjectionByID(transaction, command.id);
          if (!current) {
            throw new Error("finding was not available after correction");
          }

          return { previous, current };
        });
        if (!updated) {
          logger.debug(`cannot update finding ${command.id}: not found`);
          return null;
        }

        return { ...updated, performedBy: command.performedBy };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isForeignKeyError(error) && command.finding.assigneeId) {
          logger.debug(error, "finding update foreign key invalid assignee");
          throw new ApplicationError({
            code: "finding.assignee_unknown",
            kind: "validation",
            message: "finding assignee does not exist",
            cause: error,
            details: { assigneeId: command.finding.assigneeId, findingId: command.id },
          });
        }

        logger.error(error, `failed to get finding with id ${command.id}`);
        throw new ApplicationError({
          code: "finding.update_failed",
          kind: "unexpected",
          message: "failed to update finding",
          cause: error,
          details: { findingId: command.id },
        });
      }
    },

    async deleteByID(command: DeleteFindingByIDCommand): Promise<FindingDeletedOutcome | null> {
      try {
        const deleted = await database.transaction().execute(async (transaction) => {
          const lockedFinding = await findingPersistence.lockFinding(transaction, command.id);
          if (!lockedFinding) {
            return null;
          }

          const previous = await findingProjection.getFindingProjectionByID(
            transaction,
            command.id,
          );
          if (!previous) {
            return null;
          }

          const deletedFinding = await findingPersistence.deleteFinding(transaction, command.id);
          return deletedFinding ? { previous } : null;
        });
        if (!deleted) {
          logger.debug(`cannot delete finding ${command.id}: not found`);
          return null;
        }

        return { previous: deleted.previous, performedBy: command.performedBy };
      } catch (error) {
        logger.error(error, `failed to get finding with id ${command.id}`);
        throw new ApplicationError({
          code: "finding.delete_failed",
          kind: "unexpected",
          message: "failed to get finding",
          cause: error,
          details: { findingId: command.id },
        });
      }
    },

    async linkVulnerability(
      command: FindingVulnerabilityMutationCommand,
    ): Promise<FindingVulnerabilityMutationOutcome | null> {
      return await safelyMutateVulnerabilityLink(command, "link");
    },

    async unlinkVulnerability(
      command: FindingVulnerabilityMutationCommand,
    ): Promise<FindingVulnerabilityMutationOutcome | null> {
      return await safelyMutateVulnerabilityLink(command, "unlink");
    },
  };
}
