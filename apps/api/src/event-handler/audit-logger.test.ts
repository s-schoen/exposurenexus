import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import {
  type AssetCustomFieldDefinition,
  AssetCustomFieldType,
} from "@exposurenexus/types/model/asset-custom-field";
import { FindingSource, FindingStatus } from "@exposurenexus/types/model/finding";
import { PermissionResource, PermissionVerb } from "@exposurenexus/types/model/rbac";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import { EventBus } from "../lib/eventbus/eventbus.js";
import { createEventPayload, type DomainEvent } from "../lib/eventbus/events/index.js";
import { createTestUser } from "../test/app.js";
import { DEFAULT_AUDIT_EVENT_PATTERNS, registerAuditLogger } from "./audit-logger.js";
import { REDACTED_EVENT_LOG_VALUE } from "./log-event.js";

import type { Logger } from "pino";

describe("registerAuditLogger", () => {
  const user = createTestUser();
  const session = {
    id: "a2ca50c9-1e4d-4533-97bc-e060f58b6747",
    sessionId: "stored-session-id-digest",
    userId: user.id,
    sourceIp: "203.0.113.10",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2026-05-07T10:00:00.000Z"),
    expiresAt: new Date("2026-05-07T22:00:00.000Z"),
  };
  const vulnerability = {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-05-07T09:00:00.000Z"),
    updatedAt: new Date("2026-05-07T09:00:00.000Z"),
  };
  const finding = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    source: FindingSource.Nuclei,
    status: FindingStatus.Active,
    vulnerabilityId: vulnerability.id,
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    severity: vulnerability.severity,
    evidence: "GET /admin HTTP/1.1\nHTTP/1.1 200 OK",
    mitigation: "Restrict access to internal networks",
    assigneeId: null,
    dueDate: null,
    fingerprint: "abc123",
    firstSeen: new Date("2026-05-07T09:10:00.000Z"),
    lastSeen: new Date("2026-05-07T09:10:00.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-05-07T09:10:00.000Z"),
    updatedAt: new Date("2026-05-07T09:10:00.000Z"),
    vulnerability,
  };
  const mapping = {
    id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
    vulnerabilityId: vulnerability.id,
    source: FindingSource.Nuclei,
    matchQuery: '{"templateID":"admin-panel"}',
  };
  const asset = {
    id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    displayName: "api.exposurenexus.local",
    type: AssetType.Host,
    environment: AssetEnvironment.Production,
    lifecycleState: AssetLifecycleState.Active,
    ownerId: null,
    identifiers: [],
    createdAt: new Date("2026-05-07T09:10:00.000Z"),
    updatedAt: new Date("2026-05-07T09:10:00.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
    customFields: [],
  };
  const customFieldDefinition: AssetCustomFieldDefinition = {
    id: "5bde818a-bb4f-4a0f-a5eb-a190d5142a25",
    key: "category",
    name: "Category",
    required: false,
    type: AssetCustomFieldType.Text,
    defaultValue: null,
  };
  const role = {
    id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
    name: "analyst",
    permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
  };

  function createLogger() {
    return {
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as Pick<Logger, "info" | "warn">;
  }

  it("logs non-failure auth events at info with serialized fields", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();
    const eventTime = new Date("2026-05-07T10:00:00.000Z");

    registerAuditLogger({ eventBus, logger });

    await eventBus.emit(
      createEventPayload({
        id: "event-1",
        time: eventTime,
        subject: "auth.session.created",
        source: "auth",
        correlationId: "request-1",
        data: {
          user,
          session,
        },
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-1",
        eventSubject: "auth.session.created",
        eventSource: "auth",
        eventTime,
        correlationId: "request-1",
        data: {
          user,
          session: {
            ...session,
            sessionId: REDACTED_EVENT_LOG_VALUE,
          },
        },
      },
      "auth.session.created",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs auth failure events at warn with redacted data", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();
    const eventTime = new Date("2026-05-07T10:05:00.000Z");

    registerAuditLogger({ eventBus, logger });

    await eventBus.emit(
      createEventPayload({
        id: "event-2",
        time: eventTime,
        subject: "auth.failure",
        source: "auth",
        correlationId: "request-2",
        data: {
          sessionId: "public-session-token",
          reason: "invalid-session",
        },
      }),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      {
        eventId: "event-2",
        eventSubject: "auth.failure",
        eventSource: "auth",
        eventTime,
        correlationId: "request-2",
        data: {
          sessionId: REDACTED_EVENT_LOG_VALUE,
          reason: "invalid-session",
        },
      },
      "auth.failure",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs user events at info with serialized fields", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();
    const eventTime = new Date("2026-05-07T10:10:00.000Z");

    registerAuditLogger({ eventBus, logger });

    await eventBus.emit(
      createEventPayload({
        id: "event-3",
        time: eventTime,
        subject: "user.created",
        source: "user-profile",
        actor: "admin-user",
        correlationId: "request-3",
        data: { user },
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-3",
        eventSubject: "user.created",
        eventSource: "user-profile",
        eventTime,
        actor: "admin-user",
        correlationId: "request-3",
        data: { user },
      },
      "user.created",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("can restrict audit event patterns when configured", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();

    registerAuditLogger({
      eventBus,
      logger,
      eventPatterns: ["auth.*"],
    });

    await eventBus.emit(
      createEventPayload({
        id: "event-4",
        subject: "user.created",
        source: "user-service",
        data: { user },
      }),
    );

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs finding events at info with redacted evidence", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();
    const eventTime = new Date("2026-05-07T10:15:00.000Z");

    registerAuditLogger({ eventBus, logger });

    await eventBus.emit(
      createEventPayload({
        id: "event-5",
        time: eventTime,
        subject: "finding.created",
        source: "finding",
        actor: user.id,
        correlationId: "request-5",
        data: { finding },
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-5",
        eventSubject: "finding.created",
        eventSource: "finding",
        eventTime,
        actor: user.id,
        correlationId: "request-5",
        data: {
          finding: {
            ...finding,
            evidence: REDACTED_EVENT_LOG_VALUE,
          },
        },
      },
      "finding.created",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs vulnerability events at info with serialized fields", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();
    const eventTime = new Date("2026-05-07T10:20:00.000Z");

    registerAuditLogger({ eventBus, logger });

    await eventBus.emit(
      createEventPayload({
        id: "event-6",
        time: eventTime,
        subject: "vulnerability.mapping.created",
        source: "vulnerability",
        actor: user.id,
        correlationId: "request-6",
        data: { vulnerability, mapping },
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-6",
        eventSubject: "vulnerability.mapping.created",
        eventSource: "vulnerability",
        eventTime,
        actor: user.id,
        correlationId: "request-6",
        data: { vulnerability, mapping },
      },
      "vulnerability.mapping.created",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs asset events at info with serialized fields", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();
    const eventTime = new Date("2026-05-07T10:25:00.000Z");

    registerAuditLogger({ eventBus, logger });

    await eventBus.emit(
      createEventPayload({
        id: "event-7",
        time: eventTime,
        subject: "asset.created",
        source: "asset",
        actor: user.id,
        correlationId: "request-7",
        data: { asset },
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-7",
        eventSubject: "asset.created",
        eventSource: "asset",
        eventTime,
        actor: user.id,
        correlationId: "request-7",
        data: { asset },
      },
      "asset.created",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs custom field events at info with serialized fields", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();
    const eventTime = new Date("2026-05-07T10:27:00.000Z");

    registerAuditLogger({ eventBus, logger });

    await eventBus.emit(
      createEventPayload({
        id: "event-8",
        time: eventTime,
        subject: "custom-field.created",
        source: "asset-custom-field",
        actor: user.id,
        correlationId: "request-8",
        data: { customFieldDefinition },
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-8",
        eventSubject: "custom-field.created",
        eventSource: "asset-custom-field",
        eventTime,
        actor: user.id,
        correlationId: "request-8",
        data: { customFieldDefinition },
      },
      "custom-field.created",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs role events at info with serialized fields", async () => {
    const eventBus = new EventBus<DomainEvent>();
    const logger = createLogger();
    const eventTime = new Date("2026-05-07T10:30:00.000Z");

    registerAuditLogger({ eventBus, logger });

    await eventBus.emit(
      createEventPayload({
        id: "event-9",
        time: eventTime,
        subject: "role.updated",
        source: "role",
        actor: user.id,
        correlationId: "request-9",
        data: {
          previous: role,
          current: {
            ...role,
            name: "security-analyst",
          },
        },
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      {
        eventId: "event-9",
        eventSubject: "role.updated",
        eventSource: "role",
        eventTime,
        actor: user.id,
        correlationId: "request-9",
        data: {
          previous: role,
          current: {
            ...role,
            name: "security-analyst",
          },
        },
      },
      "role.updated",
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("audits asset, auth, custom field, role, user, finding, and vulnerability events by default", () => {
    expect(DEFAULT_AUDIT_EVENT_PATTERNS).toEqual([
      "asset.*",
      "auth.*",
      "custom-field.*",
      "role.*",
      "user.*",
      "finding.*",
      "vulnerability.*",
    ]);
  });
});
