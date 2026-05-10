import {
  FindingStatus,
  type CreateFinding,
  type Finding,
  type FindingInternal,
  type ReclassifyFindings,
  type ReclassifyFindingsResult,
  type UpdateFinding
} from "@exposurenexus/types/model/finding"
import type { Asset } from "@exposurenexus/types/model/asset"
import { HTTPException } from "hono/http-exception"
import type { UserProfile } from "@exposurenexus/types/model/user"
import { normalizeDateToUtcStart } from "@exposurenexus/types/model/date"
import { createHash } from "node:crypto"
import type { Logger } from "pino"
import {
  createDomainEventEmitter,
  type DomainEventContext,
  type DomainEventEmitter,
  type FindingEventPayloads
} from "../lib/eventbus/events/index.js"
import { badRequest, isForeignKeyError } from "./errors.js"
import type { FindingRepository } from "../repository/finding.js"

interface VulnerabilityLookupService {
  getByID(id: string): Promise<Finding["vulnerability"] | null>
}

interface AssetLookupService {
  getByID(id: string): Promise<Asset | null>
}

interface UserProfileLookupService {
  getByID(id: string): Promise<UserProfile | null>
}

interface FindingServiceDependencies {
  findingRepository: FindingRepository
  assetService: AssetLookupService
  userProfileService: UserProfileLookupService
  vulnerabilityService: VulnerabilityLookupService
  domainEventEmitter: DomainEventEmitter
  logger: Logger
}

function calculateFingerprint(
  assetId: string,
  vulnerabilityId: string,
  fingerprintOpt?: Record<string, string>
): string {
  const hash = createHash("sha256")
  hash.update(vulnerabilityId)
  hash.update(assetId)
  if (fingerprintOpt) {
    hash.update(JSON.stringify(fingerprintOpt))
  }
  return hash.digest("hex")
}

function normalizeOptionalDueDate(dueDate: Date | null | undefined) {
  return dueDate ? normalizeDateToUtcStart(dueDate) : null
}

function resolveImportedFindingStatus(
  existingStatus: FindingInternal["status"],
  importedStatus: CreateFinding["status"]
) {
  if (existingStatus === FindingStatus.Inactive) {
    return importedStatus
  }

  return existingStatus
}

export interface CreateFindingOptions {
  finding: CreateFinding
  user: UserProfile
  firstSeen?: Date
  eventContext?: DomainEventContext
}

export interface UpdateFindingOptions {
  id: string
  finding: UpdateFinding
  user: UserProfile
  eventContext?: DomainEventContext
}

export interface DeleteFindingOptions {
  id: string
  eventContext?: DomainEventContext
}

export interface ReclassifyFindingsOptions {
  reclassification: ReclassifyFindings
  user: UserProfile
  eventContext?: DomainEventContext
}

export interface CreateOrUpdateFindingResult {
  finding: Finding
  created: boolean
}

export function createFindingService({
  findingRepository,
  assetService,
  userProfileService,
  vulnerabilityService,
  domainEventEmitter,
  logger
}: FindingServiceDependencies) {
  type FindingEventSubject = keyof FindingEventPayloads & string
  const emitFindingEvent = createDomainEventEmitter<FindingEventSubject>(
    domainEventEmitter,
    "finding"
  )

  async function extendWithVulnerability(
    intFinding: FindingInternal,
    knownVulnerability?: Finding["vulnerability"]
  ): Promise<Finding> {
    const vuln =
      knownVulnerability ??
      (await vulnerabilityService.getByID(intFinding.vulnerabilityId))
    if (!vuln) {
      logger.error(
        `finding ${intFinding.id} references unknown vulnerability ${intFinding.vulnerabilityId}`
      )
      throw new Error(
        `finding ${intFinding.id} references unknown vulnerability ${intFinding.vulnerabilityId}`
      )
    }
    return {
      ...intFinding,
      vulnerability: vuln
    }
  }

  async function validateCreateFindingRelations(
    finding: CreateFinding
  ): Promise<Finding["vulnerability"]> {
    const [asset, vulnerability] = await Promise.all([
      assetService.getByID(finding.assetId),
      vulnerabilityService.getByID(finding.vulnerabilityId)
    ])

    if (!asset) {
      throw badRequest("finding asset does not exist")
    }

    if (!vulnerability) {
      throw badRequest("finding vulnerability does not exist")
    }

    const assigneeId = finding.assigneeId ?? null
    if (assigneeId) {
      const assignee = await userProfileService.getByID(assigneeId)

      if (!assignee) {
        throw badRequest("finding assignee does not exist")
      }
    }

    return vulnerability
  }

  async function createFinding(
    opts: CreateFindingOptions,
    fingerprintOpt?: Record<string, string>
  ): Promise<Finding> {
    try {
      const now = new Date()
      const assigneeId = opts.finding.assigneeId ?? null
      const dueDate = normalizeOptionalDueDate(opts.finding.dueDate)
      const vulnerability = await validateCreateFindingRelations(opts.finding)

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
          fingerprintOpt
        )
      })

      const createdFinding = await extendWithVulnerability(
        created,
        vulnerability
      )
      emitFindingEvent(
        "finding.created",
        { finding: createdFinding },
        opts.eventContext
      )
      return createdFinding
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      if (isForeignKeyError(error)) {
        logger.debug(error, "finding create foreign key invalid relation")
        throw badRequest("finding references an unknown related resource")
      }

      logger.error(
        error,
        `failed to create new finding for ${opts.finding.vulnerabilityId}`
      )
      throw new HTTPException(500, {
        message: "failed to create finding"
      })
    }
  }

  return {
    async listAll(): Promise<Finding[]> {
      try {
        const findingsRaw = await findingRepository.list()
        const findings: Array<Finding> = []

        for (const finding of findingsRaw) {
          findings.push(await extendWithVulnerability(finding))
        }
        return findings
      } catch (error) {
        logger.error(error, "failed to list findings")
        throw new HTTPException(500, {
          message: "failed to list findings"
        })
      }
    },

    async getByID(id: string): Promise<Finding | null> {
      try {
        const finding = await findingRepository.getByID(id)
        if (!finding) {
          logger.debug(`finding with id ${id} not found`)
          return null
        }

        return await extendWithVulnerability(finding)
      } catch (error) {
        logger.error(error, `failed to get finding with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to get finding"
        })
      }
    },

    async create(
      opts: CreateFindingOptions,
      fingerprintOpt?: Record<string, string>
    ): Promise<Finding> {
      return await createFinding(opts, fingerprintOpt)
    },

    async update(opts: UpdateFindingOptions): Promise<Finding | null> {
      try {
        const finding = await findingRepository.getByID(opts.id)

        if (!finding) {
          logger.debug(`cannot update finding ${opts.id}: not found`)
          return null
        }

        const assigneeId =
          typeof opts.finding.assigneeId === "undefined"
            ? finding.assigneeId
            : opts.finding.assigneeId
        const dueDate =
          typeof opts.finding.dueDate === "undefined"
            ? finding.dueDate
            : normalizeOptionalDueDate(opts.finding.dueDate)

        if (typeof opts.finding.assigneeId !== "undefined" && assigneeId) {
          const assignee = await userProfileService.getByID(assigneeId)

          if (!assignee) {
            throw badRequest("finding assignee does not exist")
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
          dueDate
        }

        const updatedFinding = await findingRepository.updateByID(
          opts.id,
          findingUpdate
        )

        const previousFinding = await extendWithVulnerability(finding)
        const currentFinding = await extendWithVulnerability(updatedFinding)
        emitFindingEvent(
          "finding.updated",
          {
            previous: previousFinding,
            current: currentFinding
          },
          opts.eventContext
        )

        return currentFinding
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(error, `failed to get finding with id ${opts.id}`)
        throw new HTTPException(500, {
          message: "failed to update finding"
        })
      }
    },

    async createOrUpdate(
      opts: CreateFindingOptions,
      fingerprintOpt?: Record<string, string>
    ): Promise<CreateOrUpdateFindingResult> {
      const fingerprint = calculateFingerprint(
        opts.finding.assetId,
        opts.finding.vulnerabilityId,
        fingerprintOpt
      )

      const finding = await findingRepository.getByFingerprint(fingerprint)
      if (finding) {
        const updatedObservation = {
          ...finding,
          status: resolveImportedFindingStatus(
            finding.status,
            opts.finding.status
          ),
          lastSeen: new Date()
        }
        const updatedFinding = await findingRepository.updateByID(
          finding.id,
          updatedObservation
        )
        const previousFinding = await extendWithVulnerability(finding)
        const currentFinding = await extendWithVulnerability(updatedFinding)
        emitFindingEvent(
          "finding.updated",
          {
            previous: previousFinding,
            current: currentFinding
          },
          opts.eventContext
        )
        return {
          finding: currentFinding,
          created: false
        }
      }

      return {
        finding: await createFinding(opts, fingerprintOpt),
        created: true
      }
    },

    async deleteByID(opts: DeleteFindingOptions): Promise<Finding | null> {
      try {
        const finding = await findingRepository.deleteByID(opts.id)

        if (!finding) {
          logger.debug(`cannot delete finding ${opts.id}: not found`)
          return null
        }

        const deletedFinding = await extendWithVulnerability(finding)
        emitFindingEvent(
          "finding.deleted",
          { finding: deletedFinding },
          opts.eventContext
        )
        return deletedFinding
      } catch (error) {
        logger.error(error, `failed to get finding with id ${opts.id}`)
        throw new HTTPException(500, {
          message: "failed to get finding"
        })
      }
    },

    async reclassify(
      opts: ReclassifyFindingsOptions
    ): Promise<ReclassifyFindingsResult> {
      const { reclassification } = opts

      try {
        const [oldVulnerability, targetVulnerability] = await Promise.all([
          vulnerabilityService.getByID(reclassification.oldVulnerabilityId),
          vulnerabilityService.getByID(reclassification.targetVulnerabilityId)
        ])

        if (!oldVulnerability) {
          throw new HTTPException(404, {
            message: `old vulnerability with id ${reclassification.oldVulnerabilityId} does not exist`
          })
        }

        if (!targetVulnerability) {
          throw new HTTPException(404, {
            message: `target vulnerability with id ${reclassification.targetVulnerabilityId} does not exist`
          })
        }

        const updatedFindings =
          await findingRepository.reclassifyBySourceAndVulnerability({
            source: reclassification.source,
            oldVulnerabilityId: reclassification.oldVulnerabilityId,
            targetVulnerabilityId: reclassification.targetVulnerabilityId,
            severity: targetVulnerability.severity,
            updatedAt: new Date(),
            updatedBy: opts.user.id
          })
        const result = {
          updatedCount: updatedFindings.length
        }

        emitFindingEvent(
          "finding.reclassified",
          {
            source: reclassification.source,
            oldVulnerabilityId: oldVulnerability.id,
            targetVulnerabilityId: targetVulnerability.id,
            updatedCount: result.updatedCount
          },
          opts.eventContext
        )

        return result
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error
        }

        logger.error(
          error,
          `failed to reclassify findings from ${reclassification.oldVulnerabilityId} to ${reclassification.targetVulnerabilityId}`
        )
        throw new HTTPException(500, {
          message: "failed to reclassify findings"
        })
      }
    }
  }
}
