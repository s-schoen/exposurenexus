import { createDomainEventEmitter } from "./eventbus/events/index.js";

import type {
  DomainEventContext,
  DomainEventEmitter,
  EventSubjects,
  RoleEventPayloads,
  UserEventPayloads,
} from "./eventbus/events/index.js";
import type {
  Identity,
  IdentityAuthorization,
  IdentityRoles,
  IdentityUsers,
} from "@exposurenexus/backend/identity";
import type { CreateRole, Role, UpdateRole } from "@exposurenexus/contracts/model/rbac";
import type {
  CreateUserProfile,
  UpdateUserProfile,
  UserProfile,
} from "@exposurenexus/contracts/model/user";

export interface UpdateApiUserByIDOptions {
  id: string;
  userProfile: UpdateUserProfile;
  eventContext: DomainEventContext;
}

export interface ApiIdentityUsers {
  listAll: IdentityUsers["listAll"];
  getByID: IdentityUsers["getByID"];
  getByUsername: IdentityUsers["getByUsername"];
  create(userProfile: CreateUserProfile, eventContext: DomainEventContext): Promise<UserProfile>;
  updateByID(options: UpdateApiUserByIDOptions): Promise<UserProfile | null>;
}

export interface UpdateApiRoleByIDOptions {
  id: string;
  role: UpdateRole;
  eventContext: DomainEventContext;
}

export interface ApiIdentityRoles {
  listAll: IdentityRoles["listAll"];
  getByID: IdentityRoles["getByID"];
  getByNames: IdentityRoles["getByNames"];
  resolveRoleIdsFromNames: IdentityRoles["resolveRoleIdsFromNames"];
  requireRoleNamesFromIds: IdentityRoles["requireRoleNamesFromIds"];
  create(role: CreateRole, eventContext: DomainEventContext): Promise<Role>;
  updateByID(options: UpdateApiRoleByIDOptions): Promise<Role | null>;
  deleteByID(id: string, eventContext: DomainEventContext): Promise<Role | null>;
}

export interface ApiIdentity {
  users: ApiIdentityUsers;
  roles: ApiIdentityRoles;
  authorization: IdentityAuthorization;
}

function requirePerformedBy(eventContext: DomainEventContext): string {
  if (!eventContext.actor) {
    throw new TypeError("identity mutations require an authenticated actor");
  }

  return eventContext.actor;
}

function eventContextForOutcome(
  eventContext: DomainEventContext,
  performedBy: string,
): DomainEventContext {
  return {
    ...eventContext,
    actor: performedBy,
  };
}

export function decorateIdentityWithEvents(
  identity: Identity,
  domainEventEmitter: DomainEventEmitter,
): ApiIdentity {
  const emitUserEvent = createDomainEventEmitter<EventSubjects<UserEventPayloads>>(
    domainEventEmitter,
    "user-profile",
  );
  const emitRoleEvent = createDomainEventEmitter<EventSubjects<RoleEventPayloads>>(
    domainEventEmitter,
    "role",
  );

  return {
    users: {
      listAll: identity.users.listAll.bind(identity.users),
      getByID: identity.users.getByID.bind(identity.users),
      getByUsername: identity.users.getByUsername.bind(identity.users),

      async create(userProfile, eventContext): Promise<UserProfile> {
        const outcome = await identity.users.create({
          userProfile,
          performedBy: requirePerformedBy(eventContext),
        });
        emitUserEvent(
          "user.created",
          { user: outcome.current },
          eventContextForOutcome(eventContext, outcome.performedBy),
        );
        return outcome.current;
      },

      async updateByID({
        id,
        userProfile,
        eventContext,
      }: UpdateApiUserByIDOptions): Promise<UserProfile | null> {
        const outcome = await identity.users.updateByID({
          id,
          userProfile,
          performedBy: requirePerformedBy(eventContext),
        });
        if (!outcome) {
          return null;
        }

        emitUserEvent(
          "user.updated",
          { previous: outcome.previous, current: outcome.current },
          eventContextForOutcome(eventContext, outcome.performedBy),
        );
        return outcome.current;
      },
    },
    roles: {
      listAll: identity.roles.listAll.bind(identity.roles),
      getByID: identity.roles.getByID.bind(identity.roles),
      getByNames: identity.roles.getByNames.bind(identity.roles),
      resolveRoleIdsFromNames: identity.roles.resolveRoleIdsFromNames.bind(identity.roles),
      requireRoleNamesFromIds: identity.roles.requireRoleNamesFromIds.bind(identity.roles),

      async create(role, eventContext): Promise<Role> {
        const outcome = await identity.roles.create({
          role,
          performedBy: requirePerformedBy(eventContext),
        });
        emitRoleEvent(
          "role.created",
          { role: outcome.current },
          eventContextForOutcome(eventContext, outcome.performedBy),
        );
        return outcome.current;
      },

      async updateByID({ id, role, eventContext }: UpdateApiRoleByIDOptions): Promise<Role | null> {
        const outcome = await identity.roles.updateByID({
          id,
          role,
          performedBy: requirePerformedBy(eventContext),
        });
        if (!outcome) {
          return null;
        }

        if (outcome.changed) {
          emitRoleEvent(
            "role.updated",
            { previous: outcome.previous, current: outcome.current },
            eventContextForOutcome(eventContext, outcome.performedBy),
          );
        }
        return outcome.current;
      },

      async deleteByID(id, eventContext): Promise<Role | null> {
        const outcome = await identity.roles.deleteByID({
          id,
          performedBy: requirePerformedBy(eventContext),
        });
        if (!outcome) {
          return null;
        }

        emitRoleEvent(
          "role.deleted",
          { role: outcome.previous },
          eventContextForOutcome(eventContext, outcome.performedBy),
        );
        return outcome.previous;
      },
    },
    authorization: identity.authorization,
  };
}
