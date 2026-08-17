import { createHash } from "node:crypto";

import { normalizeDateToUtcStart } from "@exposurenexus/types/model/date";
import {
  FindingStatus,
  type CreateFinding,
  type Finding,
  type FindingInternal,
  type FindingProjection,
  type UpdateFinding,
} from "@exposurenexus/types/model/finding";

import {
  createDomainEventEmitter,
  type DomainEventContext,
  type DomainEventEmitter,
  type EventSubjects,
  type FindingEventPayloads,
} from "../lib/eventbus/events/index.js";
import { ApplicationError, isApplicationError } from "./application-error.js";
import { isForeignKeyError } from "./errors.js";

import type { FindingPersistenceRepository } from "../repository/finding-persistence.js";
import type { FindingVulnerabilityRepository } from "../repository/finding-vulnerability.js";
import type { FindingRepository } from "../repository/finding.js";
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
    "getProjectedByID" | "listProjected" | "deleteByID"
  >;
  findingVulnerabilityRepository?: FindingVulnerabilityRepository;
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
  finding: CreateFinding;
  user: UserProfile;
  firstSeen?: Date;
  fingerprintOptions?: Record<string, string>;
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

export interface CreateOrUpdateFindingResult {
  finding: Finding;
  created: boolean;
}

export interface FindingService {
  listAll(): Promise<FindingProjection[]>;
  getByID(id: string): Promise<FindingProjection | null>;
  create(opts: CreateFindingOptions): Promise<Finding>;
  updateByID(opts: UpdateFindingOptions): Promise<Finding | null>;
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
  findingVulnerabilityRepository,
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
    finding: CreateFinding,
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

    async updateByID(opts: UpdateFindingOptions): Promise<Finding | null> {
      try {
        const finding = await findingRepository.getByID(opts.id);

        if (!finding) {
          logger.debug(`cannot update finding ${opts.id}: not found`);
          return null;
        }

        const assigneeId = opts.finding.assigneeId;
        const dueDate = normalizeOptionalDueDate(opts.finding.dueDate);

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

        const findingUpdate: Omit<FindingInternal, "id"> = {
          ...opts.finding,
          firstSeen: finding.firstSeen,
          lastSeen: finding.lastSeen,
          assetId: finding.assetId,
          vulnerabilityId: finding.vulnerabilityId,
          createdAt: finding.createdAt,
          createdBy: finding.createdBy,
          assigneeId,
          fingerprint: finding.fingerprint,
          updatedAt: new Date(),
          updatedBy: opts.user.id,
          dueDate,
        };

        const updatedFinding = await findingRepository.updateByID(opts.id, findingUpdate);

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
