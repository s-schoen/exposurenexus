import type {
  CreateFinding,
  FindingInternal
} from "@openvlp/types/model/finding"
import { HTTPException } from "hono/http-exception"
import type { Finding } from "@openvlp/types/model/finding"
import type { UserProfile } from "@openvlp/types/model/user"
import { createHash } from "node:crypto"
import type { Logger } from "pino"

interface FindingRepository {
  list(): Promise<FindingInternal[]>
  getByID(id: string): Promise<FindingInternal | null>
  getByFingerprint(hash: string): Promise<FindingInternal | null>
  create(finding: Omit<FindingInternal, "id">): Promise<FindingInternal>
  update(
    id: string,
    updatedFinding: Omit<FindingInternal, "id">
  ): Promise<FindingInternal>
  deleteByID(id: string): Promise<FindingInternal | null>
}

interface VulnerabilityLookupService {
  getByID(id: string): Promise<Finding["vulnerability"] | null>
}

interface FindingServiceDependencies {
  findingRepository: FindingRepository
  vulnerabilityService: VulnerabilityLookupService
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

export interface CreateFindingOptions {
  finding: CreateFinding
  user: UserProfile
  firstSeen?: Date
}

export interface UpdateFindingOptions {
  id: string
  finding: CreateFinding
  user: UserProfile
}

export interface CreateOrUpdateFindingResult {
  finding: Finding
  created: boolean
}

export function createFindingService({
  findingRepository,
  vulnerabilityService,
  logger
}: FindingServiceDependencies) {
  async function extendWithVulnerability(
    intFinding: FindingInternal
  ): Promise<Finding> {
    const vuln = await vulnerabilityService.getByID(intFinding.vulnerabilityId)
    if (!vuln) {
      logger.error(
        `finding ${intFinding.id} references unknown vulnerability ${intFinding.vulnerabilityId}`
      )
      return intFinding as Finding
    }
    return {
      ...intFinding,
      vulnerability: vuln
    }
  }

  async function createFinding(
    opts: CreateFindingOptions,
    fingerprintOpt?: Record<string, string>
  ): Promise<Finding> {
    try {
      const now = new Date()

      const created = await findingRepository.create({
        createdAt: now,
        updatedAt: now,
        createdBy: opts.user.id,
        updatedBy: opts.user.id,
        firstSeen: opts.firstSeen ?? now,
        lastSeen: opts.firstSeen ?? now,
        fingerprint: calculateFingerprint(
          opts.finding.assetId,
          opts.finding.vulnerabilityId,
          fingerprintOpt
        ),
        ...opts.finding
      })

      logger.info(`created finding ${created.id}}`)
      return await extendWithVulnerability(created)
    } catch (error) {
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

        const findingUpdate: Omit<FindingInternal, "id"> = {
          firstSeen: finding.firstSeen,
          lastSeen: finding.lastSeen,
          createdAt: finding.createdAt,
          createdBy: finding.createdBy,
          fingerprint: finding.fingerprint,
          updatedAt: new Date(),
          updatedBy: opts.user.id,
          ...opts.finding
        }

        const updatedFinding = await findingRepository.update(
          opts.id,
          findingUpdate
        )

        logger.info(`updated finding ${opts.id}`)

        return await extendWithVulnerability(updatedFinding)
      } catch (error) {
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

      let finding = await findingRepository.getByFingerprint(fingerprint)
      if (finding) {
        finding.lastSeen = new Date()
        finding = await findingRepository.update(finding.id, finding)
        return {
          finding: await extendWithVulnerability(finding),
          created: false
        }
      }

      return {
        finding: await createFinding(opts, fingerprintOpt),
        created: true
      }
    },

    async deleteByID(id: string): Promise<Finding | null> {
      try {
        const finding = await findingRepository.deleteByID(id)

        if (!finding) {
          logger.debug(`cannot delete finding ${id}: not found`)
          return null
        }

        return await extendWithVulnerability(finding)
      } catch (error) {
        logger.error(error, `failed to get finding with id ${id}`)
        throw new HTTPException(500, {
          message: "failed to get finding"
        })
      }
    }
  }
}
