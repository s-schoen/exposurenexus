import * as findingRepository from "../repository/finding.js"
import type { CreateFinding } from "@openvlp/types/model/finding"
import { createLogger } from "../logging.js"
import { HTTPException } from "hono/http-exception"
import type { Finding } from "@openvlp/types/model/finding"
import type { User } from "better-auth"

const logger = createLogger("service/finding")

export async function listAll(): Promise<Finding[]> {
  try {
    return findingRepository.list()
  } catch (error) {
    logger.error(error, "failed to list findings")
    throw new HTTPException(500, {
      message: "failed to list findings"
    })
  }
}

export async function getByID(id: string): Promise<Finding | null> {
  try {
    const finding = await findingRepository.getByID(id)
    if (!finding) {
      logger.debug(`finding with id ${id} not found`)
    }
    return finding
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

export async function create(opts: CreateFindingOptions): Promise<Finding> {
  try {
    const now = new Date()

    // TODO: calculate fingerprint
    const created = await findingRepository.create({
      id: "",
      createdAt: now,
      updatedAt: now,
      createdBy: opts.user.id,
      updatedBy: opts.user.id,
      firstSeen: opts.firstSeen ?? now,
      lastSeen: opts.firstSeen ?? now,
      fingerprint: "",
      ...opts.finding
    })

    logger.info(`created finding ${created.id}}`)
    return created
  } catch (error) {
    logger.error(error, `failed to create new finding ${opts.finding.title}`)
    throw new HTTPException(500, {
      message: "failed to create finding"
    })
  }
}

export async function deleteByID(id: string): Promise<Finding | null> {
  try {
    const finding = findingRepository.deleteByID(id)
    if (!finding) {
      logger.debug(`cannot delete finding ${id}: not found`)
    }
    return finding
  } catch (error) {
    logger.error(error, `failed to get finding with id ${id}`)
    throw new HTTPException(500, {
      message: "failed to get finding"
    })
  }
}
