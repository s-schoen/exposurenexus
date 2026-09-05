import {
  type VulnerabilityCatalog,
  type VulnerabilityInput,
} from "@exposurenexus/contracts/model/vulnerability";

import { ApplicationError, isApplicationError } from "../application-error.js";
import { isConflictError } from "../database-error.js";
import { vulnerabilityInputSchema } from "./vulnerability-rules.js";

import type { DatabaseExecutor } from "../database/executor.js";
import type { Database } from "../database/index.js";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

interface VulnerabilityPersistence {
  listVulnerabilities(database: DatabaseExecutor): Promise<VulnerabilityCatalog[]>;
  getVulnerabilityByID(
    database: DatabaseExecutor,
    id: string,
  ): Promise<VulnerabilityCatalog | null>;
  insertVulnerability(
    database: DatabaseExecutor,
    vulnerability: VulnerabilityInput & {
      createdAt: Date;
      updatedAt: Date;
      createdBy: string;
      updatedBy: string;
    },
  ): Promise<VulnerabilityCatalog>;
  updateVulnerability(
    database: DatabaseExecutor,
    id: string,
    vulnerability: VulnerabilityInput & { updatedAt: Date; updatedBy: string },
  ): Promise<VulnerabilityCatalog | null>;
  deleteVulnerability(database: DatabaseExecutor, id: string): Promise<VulnerabilityCatalog | null>;
}

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
  database: Kysely<Database>;
  vulnerabilityPersistence: VulnerabilityPersistence;
  userProfileLookup: UserProfileLookup;
  logger: Logger;
}

interface UserProfileLookup {
  getByID(database: DatabaseExecutor, id: string): Promise<object | null>;
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
  database: DatabaseExecutor,
  performedBy: string,
): Promise<void> {
  if (!(await userProfileLookup.getByID(database, performedBy))) {
    throw new Error(`vulnerability audit actor ${performedBy} does not exist`);
  }
}

export function createVulnerabilities({
  database,
  vulnerabilityPersistence,
  userProfileLookup,
  logger,
}: VulnerabilityDependencies): ExposureVulnerabilities {
  return {
    async listAll(): Promise<VulnerabilityCatalog[]> {
      try {
        return await vulnerabilityPersistence.listVulnerabilities(database);
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
        return await vulnerabilityPersistence.getVulnerabilityByID(database, id);
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
        const now = new Date();
        const created = await database.transaction().execute(async (transaction) => {
          await requireAuditActor(userProfileLookup, transaction, command.performedBy);
          return await vulnerabilityPersistence.insertVulnerability(transaction, {
            ...vulnerability,
            createdAt: now,
            updatedAt: now,
            createdBy: command.performedBy,
            updatedBy: command.performedBy,
          });
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
        const updated = await database.transaction().execute(async (transaction) => {
          const previous = await vulnerabilityPersistence.getVulnerabilityByID(
            transaction,
            command.id,
          );
          if (!previous) {
            return null;
          }

          await requireAuditActor(userProfileLookup, transaction, command.performedBy);
          const current = await vulnerabilityPersistence.updateVulnerability(
            transaction,
            command.id,
            {
              ...vulnerability,
              updatedAt: new Date(),
              updatedBy: command.performedBy,
            },
          );
          return current ? { previous, current } : null;
        });
        if (!updated) {
          return null;
        }

        return { ...updated, performedBy: command.performedBy };
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
        const deleted = await database
          .transaction()
          .execute((transaction) =>
            vulnerabilityPersistence.deleteVulnerability(transaction, command.id),
          );
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
