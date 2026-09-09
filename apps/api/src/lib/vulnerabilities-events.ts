import { createDomainEventEmitter } from "./eventbus/events/index.js";

import type {
  DomainEventContext,
  DomainEventEmitter,
  EventSubjects,
  VulnerabilityEventPayloads,
} from "./eventbus/events/index.js";
import type {
  DeleteVulnerabilityByIDCommand,
  Vulnerabilities,
} from "@exposurenexus/backend/vulnerabilities";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type {
  VulnerabilityCatalog,
  VulnerabilityInput,
} from "@exposurenexus/contracts/model/vulnerability";

export interface CreateApiVulnerabilityOptions {
  vulnerability: VulnerabilityInput;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface UpdateApiVulnerabilityOptions {
  id: string;
  vulnerability: VulnerabilityInput;
  user: UserProfile;
  eventContext?: DomainEventContext;
}

export interface ApiVulnerabilityOperations {
  listAll: Vulnerabilities["listAll"];
  getByID: Vulnerabilities["getByID"];
  create(options: CreateApiVulnerabilityOptions): Promise<VulnerabilityCatalog>;
  updateByID(options: UpdateApiVulnerabilityOptions): Promise<VulnerabilityCatalog | null>;
  deleteByID(id: string, eventContext?: DomainEventContext): Promise<VulnerabilityCatalog | null>;
}

function requirePerformedBy(eventContext: DomainEventContext | undefined): string {
  if (!eventContext?.actor) {
    throw new TypeError("exposure mutations require an authenticated actor");
  }

  return eventContext.actor;
}

export function decorateVulnerabilitiesWithEvents(
  vulnerabilities: Vulnerabilities,
  domainEventEmitter: DomainEventEmitter,
): ApiVulnerabilityOperations {
  const emitVulnerabilityEvent = createDomainEventEmitter<
    EventSubjects<VulnerabilityEventPayloads>
  >(domainEventEmitter, "vulnerability");

  return {
    listAll: vulnerabilities.listAll.bind(vulnerabilities),
    getByID: vulnerabilities.getByID.bind(vulnerabilities),

    async create({ vulnerability, user, eventContext }): Promise<VulnerabilityCatalog> {
      const outcome = await vulnerabilities.create({
        vulnerability,
        performedBy: user.id,
      });
      emitVulnerabilityEvent(
        "vulnerability.created",
        { vulnerability: outcome.current },
        eventContext,
      );
      return outcome.current;
    },

    async updateByID({
      id,
      vulnerability,
      user,
      eventContext,
    }): Promise<VulnerabilityCatalog | null> {
      const outcome = await vulnerabilities.updateByID({
        id,
        vulnerability,
        performedBy: user.id,
      });
      if (!outcome) {
        return null;
      }

      emitVulnerabilityEvent(
        "vulnerability.updated",
        { previous: outcome.previous, current: outcome.current },
        eventContext,
      );
      return outcome.current;
    },

    async deleteByID(id, eventContext): Promise<VulnerabilityCatalog | null> {
      const command = {
        id,
        performedBy: requirePerformedBy(eventContext),
      } satisfies DeleteVulnerabilityByIDCommand;
      const outcome = await vulnerabilities.deleteByID(command);
      if (!outcome) {
        return null;
      }

      emitVulnerabilityEvent(
        "vulnerability.deleted",
        { vulnerability: outcome.previous },
        eventContext,
      );
      return outcome.previous;
    },
  };
}
