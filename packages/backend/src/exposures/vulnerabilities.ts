import {
  vulnerabilityInputSchema,
  type VulnerabilityCatalog,
  type VulnerabilityInput,
} from "@exposurenexus/contracts/model/vulnerability";

import { ApplicationError, isApplicationError } from "../application-error.js";
import { isConflictError } from "../database-error.js";

import type { VulnerabilityRepository } from "./vulnerability-repository.js";
import type { Logger } from "pino";

export interface CreateVulnerabilityCommand {
  vulnerability: VulnerabilityInput;
  performedBy: string;
}

export interface UpdateVulnerabilityByIDCommand {
  id: string;
  vulnerability: VulnerabilityInput;
  performedBy: string;
}

export interface DeleteVulnerabilityByIDCommand {
  id: string;
  performedBy: string;
}

export interface VulnerabilityCreatedOutcome {
  current: VulnerabilityCatalog;
  performedBy: string;
}

export interface VulnerabilityUpdatedOutcome {
  previous: VulnerabilityCatalog;
  current: VulnerabilityCatalog;
  performedBy: string;
}

export interface VulnerabilityDeletedOutcome {
  previous: VulnerabilityCatalog;
  performedBy: string;
}

export interface ExposureVulnerabilities {
  listAll(): Promise<VulnerabilityCatalog[]>;
  getByID(id: string): Promise<VulnerabilityCatalog | null>;
  create(command: CreateVulnerabilityCommand): Promise<VulnerabilityCreatedOutcome>;
  updateByID(command: UpdateVulnerabilityByIDCommand): Promise<VulnerabilityUpdatedOutcome | null>;
  deleteByID(command: DeleteVulnerabilityByIDCommand): Promise<VulnerabilityDeletedOutcome | null>;
}

interface VulnerabilityDependencies {
  vulnerabilityRepository: VulnerabilityRepository;
  userProfileLookup: UserProfileLookup;
  logger: Logger;
}

interface UserProfileLookup {
  getByID(id: string): Promise<object | null>;
}

function parseCatalogInput(input: VulnerabilityInput): VulnerabilityInput {
  const result = vulnerabilityInputSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  throw new ApplicationError({
    code: "vulnerability.invalid_input",
    kind: "validation",
    message: "vulnerability catalog input is invalid",
    details: { issues: result.error.issues },
    cause: result.error,
  });
}

async function requireAuditActor(
  userProfileLookup: UserProfileLookup,
  performedBy: string,
): Promise<void> {
  if (!(await userProfileLookup.getByID(performedBy))) {
    throw new Error(`vulnerability audit actor ${performedBy} does not exist`);
  }
}

export function createVulnerabilities({
  vulnerabilityRepository,
  userProfileLookup,
  logger,
}: VulnerabilityDependencies): ExposureVulnerabilities {
  return {
    async listAll(): Promise<VulnerabilityCatalog[]> {
      try {
        return await vulnerabilityRepository.list();
      } catch (error) {
        logger.error(error, "failed to list vulnerabilities");
        throw new ApplicationError({
          code: "vulnerability.list_failed",
          kind: "unexpected",
          message: "failed to list vulnerabilities",
          cause: error,
        });
      }
    },

    async getByID(id: string): Promise<VulnerabilityCatalog | null> {
      try {
        return await vulnerabilityRepository.getByID(id);
      } catch (error) {
        logger.error(error, `failed to get vulnerability with id ${id}`);
        throw new ApplicationError({
          code: "vulnerability.get_failed",
          kind: "unexpected",
          message: "failed to get vulnerability",
          cause: error,
          details: { vulnerabilityId: id },
        });
      }
    },

    async create(command: CreateVulnerabilityCommand): Promise<VulnerabilityCreatedOutcome> {
      const vulnerability = parseCatalogInput(command.vulnerability);

      try {
        await requireAuditActor(userProfileLookup, command.performedBy);
        const now = new Date();
        const created = await vulnerabilityRepository.create({
          ...vulnerability,
          createdAt: now,
          updatedAt: now,
          createdBy: command.performedBy,
          updatedBy: command.performedBy,
        });

        return { current: created, performedBy: command.performedBy };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isConflictError(error)) {
          throw new ApplicationError({
            code: "vulnerability.identity_conflict",
            kind: "conflict",
            message: "a vulnerability with this type and identifier already exists",
            cause: error,
            details: {
              type: vulnerability.type,
              identifier: vulnerability.identifier,
            },
          });
        }

        logger.error(error, `failed to create vulnerability ${vulnerability.identifier}`);
        throw new ApplicationError({
          code: "vulnerability.create_failed",
          kind: "unexpected",
          message: "failed to create vulnerability",
          cause: error,
          details: {
            type: vulnerability.type,
            identifier: vulnerability.identifier,
          },
        });
      }
    },

    async updateByID(
      command: UpdateVulnerabilityByIDCommand,
    ): Promise<VulnerabilityUpdatedOutcome | null> {
      const vulnerability = parseCatalogInput(command.vulnerability);

      try {
        const previous = await vulnerabilityRepository.getByID(command.id);
        if (!previous) {
          return null;
        }

        await requireAuditActor(userProfileLookup, command.performedBy);
        const current = await vulnerabilityRepository.updateByID(command.id, {
          ...vulnerability,
          updatedAt: new Date(),
          updatedBy: command.performedBy,
        });
        if (!current) {
          return null;
        }

        return { previous, current, performedBy: command.performedBy };
      } catch (error) {
        if (isApplicationError(error)) {
          throw error;
        }

        if (isConflictError(error)) {
          throw new ApplicationError({
            code: "vulnerability.identity_conflict",
            kind: "conflict",
            message: "a vulnerability with this type and identifier already exists",
            cause: error,
            details: {
              type: vulnerability.type,
              identifier: vulnerability.identifier,
            },
          });
        }

        logger.error(error, `failed to update vulnerability with id ${command.id}`);
        throw new ApplicationError({
          code: "vulnerability.update_failed",
          kind: "unexpected",
          message: "failed to update vulnerability",
          cause: error,
          details: { vulnerabilityId: command.id },
        });
      }
    },

    async deleteByID(
      command: DeleteVulnerabilityByIDCommand,
    ): Promise<VulnerabilityDeletedOutcome | null> {
      try {
        const deleted = await vulnerabilityRepository.deleteByID(command.id);
        if (!deleted) {
          return null;
        }

        return { previous: deleted, performedBy: command.performedBy };
      } catch (error) {
        logger.error(error, `failed to delete vulnerability with id ${command.id}`);
        throw new ApplicationError({
          code: "vulnerability.delete_failed",
          kind: "unexpected",
          message: "failed to delete vulnerability",
          cause: error,
          details: { vulnerabilityId: command.id },
        });
      }
    },
  };
}
