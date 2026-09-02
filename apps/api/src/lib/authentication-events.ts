import { createDomainEventEmitter } from "./eventbus/events/index.js";

import type {
  AuthEventPayloads,
  DomainEventContext,
  DomainEventEmitter,
  EventSubjects,
} from "./eventbus/events/index.js";
import type {
  Authentication,
  AuthenticationSession,
  CreateSessionCommand,
  CreateSessionForCredentialsCommand,
  SessionCreatedOutcome,
} from "@exposurenexus/backend/authentication";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

interface ApiEventContext {
  correlationId?: string;
  actor?: string;
}

export type CreateApiSessionInput = CreateSessionCommand & ApiEventContext;
export type CreateApiSessionForCredentialsInput = CreateSessionForCredentialsCommand &
  ApiEventContext;

export interface ValidateApiSessionInput extends ApiEventContext {
  sessionId: string;
}

export interface RevokeApiSessionInput extends ApiEventContext {
  sessionId: string;
}

export interface ApiCreatedSession {
  sessionId: string;
  session: AuthenticationSession;
  user: UserProfile;
}

export interface ApiValidatedSession {
  session: AuthenticationSession;
  user: UserProfile;
}

export interface ApiAuthentication {
  createSessionForCredentials(
    input: CreateApiSessionForCredentialsInput,
  ): Promise<ApiCreatedSession | null>;
  createSession(input: CreateApiSessionInput): Promise<ApiCreatedSession>;
  validateSession(input: ValidateApiSessionInput): Promise<ApiValidatedSession | null>;
  revokeSession(input: RevokeApiSessionInput): Promise<boolean>;
}

function eventContext(input: ApiEventContext): DomainEventContext {
  return {
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    ...(input.actor !== undefined ? { actor: input.actor } : {}),
  };
}

function toApiSession(session: AuthenticationSession): AuthenticationSession {
  return {
    id: session.id,
    userId: session.userId,
    sourceIp: session.sourceIp,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function toApiCreatedSession(outcome: SessionCreatedOutcome): ApiCreatedSession {
  return {
    sessionId: outcome.sessionToken,
    session: toApiSession(outcome.session),
    user: outcome.user,
  };
}

export function decorateAuthenticationWithEvents(
  authentication: Authentication,
  domainEventEmitter: DomainEventEmitter,
): ApiAuthentication {
  const emitAuthEvent = createDomainEventEmitter<EventSubjects<AuthEventPayloads>>(
    domainEventEmitter,
    "auth",
  );

  return {
    async createSessionForCredentials(input): Promise<ApiCreatedSession | null> {
      const outcome = await authentication.createSessionForCredentials({
        username: input.username,
        password: input.password,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
      });
      const context = eventContext(input);

      if (!outcome.authenticated) {
        emitAuthEvent("auth.failure", { reason: outcome.reason }, context);
        return null;
      }

      const createdSession = toApiCreatedSession(outcome);
      emitAuthEvent("auth.success", { user: createdSession.user }, context);
      emitAuthEvent("auth.session.created", { session: createdSession.session }, context);
      return createdSession;
    },

    async createSession(input): Promise<ApiCreatedSession> {
      const outcome = await authentication.createSession({
        userId: input.userId,
        sourceIp: input.sourceIp,
        userAgent: input.userAgent,
      });

      const createdSession = toApiCreatedSession(outcome);
      emitAuthEvent(
        "auth.session.created",
        { session: createdSession.session },
        eventContext(input),
      );
      return createdSession;
    },

    async validateSession(input): Promise<ApiValidatedSession | null> {
      const outcome = await authentication.validateSession({ sessionToken: input.sessionId });

      if (!outcome.valid) {
        emitAuthEvent("auth.failure", { reason: outcome.reason }, eventContext(input));
        return null;
      }

      return {
        session: toApiSession(outcome.session),
        user: outcome.user,
      };
    },

    async revokeSession(input): Promise<boolean> {
      const outcome = await authentication.revokeSession({ sessionToken: input.sessionId });

      if (outcome.revoked) {
        emitAuthEvent(
          "auth.session.revoked",
          { session: toApiSession(outcome.session) },
          eventContext(input),
        );
      }

      return outcome.revoked;
    },
  };
}
