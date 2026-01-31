import * as findingRepository from "../repository/finding.js"
import * as vulnerabilityService from "../service/vulnerability.js"
import type {
  CreateFinding,
  FindingInternal
} from "@openvlp/types/model/finding"
import { createLogger } from "../logging.js"
import { HTTPException } from "hono/http-exception"
import type { Vulnerability } from "@openvlp/types/model/finding"
import type { User } from "better-auth"
import { createHash } from "node:crypto"

const logger = createLogger("service/finding")

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

async function extendWithVulnerability(
  intFinding: FindingInternal
): Promise<Vulnerability> {
  const vuln = await vulnerabilityService.getByID(intFinding.vulnerabilityId)
  if (!vuln) {
    logger.error(
      `finding ${intFinding.id} references unknown vulnerability ${intFinding.vulnerabilityId}`
    )
    return intFinding as Vulnerability
  }
  return {
    ...intFinding,
    vulnerability: vuln
  }
}

export async function listAll(): Promise<Vulnerability[]> {
  try {
    const findingsRaw = await findingRepository.list()
    const findings: Array<Vulnerability> = []

    // get vulnerability data
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
}

export async function getByID(id: string): Promise<Vulnerability | null> {
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
}

export interface CreateFindingOptions {
  finding: CreateFinding
  user: User
  firstSeen?: Date
}

export async function create(
  opts: CreateFindingOptions,
  fingerprintOpt?: Record<string, string>
): Promise<Vulnerability> {
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
    return created
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

export interface CreateOrUpdateFindingResult {
  finding: Vulnerability
  created: boolean
}

export async function createOrUpdate(
  opts: CreateFindingOptions,
  fingerprintOpt?: Record<string, string>
): Promise<CreateOrUpdateFindingResult> {
  const fingerprint = calculateFingerprint(
    opts.finding.assetId,
    opts.finding.vulnerabilityId,
    fingerprintOpt
  )

  // check if finding with that fingerprint already exists
  let finding = await findingRepository.getByFingerprint(fingerprint)
  if (finding) {
    // already exists, we need to update lastSeen
    finding.lastSeen = new Date()
    finding = await findingRepository.update(finding.id, finding)
    return {
      finding: await extendWithVulnerability(finding),
      created: false
    }
  }

  // we need to create a new finding
  return {
    finding: await create(opts, fingerprintOpt),
    created: true
  }
}

export async function deleteByID(id: string): Promise<Vulnerability | null> {
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
