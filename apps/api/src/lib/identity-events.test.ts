import { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDomainEventCollector } from "../test/eventbus.js";
import { decorateIdentityWithEvents } from "./identity-events.js";

import type { Identity } from "@exposurenexus/backend/identity";

const performedBy = "95d5909c-a9ab-4350-a515-4b89eb1065ae";
const eventContext = {
  actor: performedBy,
  correlationId: "identity-request",
};
const user = {
  id: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.com",
  enabled: true,
  roleIds: [],
};
const previousRole = {
  id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
  name: "analyst",
  permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
};
const currentRole = {
  ...previousRole,
  name: "security-analyst",
};

const identity = {
  users: {
    createInitialAdmin: vi.fn(),
    listAll: vi.fn(),
    getByID: vi.fn(),
    getByUsername: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
  },
  roles: {
    listAll: vi.fn(),
    getByID: vi.fn(),
    getByNames: vi.fn(),
    resolveRoleIdsFromNames: vi.fn(),
    requireRoleNamesFromIds: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
  },
  authorization: {
    userHasPermission: vi.fn(),
  },
} satisfies Identity;
const domainEvents = createDomainEventCollector();

describe("identity event decorators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.clear();
  });

  it("emits user creation facts and returns the route-facing user", async () => {
    identity.users.create.mockResolvedValue({ current: user, performedBy });
    const decorated = decorateIdentityWithEvents(identity, domainEvents.emitter);
    const input = {
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      enabled: user.enabled,
      roleIds: user.roleIds,
      password: "correct-horse-battery-staple",
    };

    await expect(decorated.users.create(input, eventContext)).resolves.toEqual(user);
    expect(identity.users.create).toHaveBeenCalledWith({ userProfile: input, performedBy });
    expect(domainEvents.events).toHaveLength(1);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "user.created",
      source: "user-profile",
      actor: performedBy,
      correlationId: eventContext.correlationId,
      data: { user },
    });
    expect(domainEvents.events[0]?.data).not.toHaveProperty("user.passwordHash");
  });

  it("emits user update snapshots and preserves null results", async () => {
    const current = { ...user, displayName: "Alice Updated" };
    identity.users.updateByID
      .mockResolvedValueOnce({ previous: user, current, performedBy })
      .mockResolvedValueOnce(null);
    const decorated = decorateIdentityWithEvents(identity, domainEvents.emitter);
    const options = {
      id: user.id,
      userProfile: {
        displayName: current.displayName,
        email: current.email,
        enabled: current.enabled,
        roleIds: current.roleIds,
      },
      eventContext,
    };

    await expect(decorated.users.updateByID(options)).resolves.toEqual(current);
    await expect(decorated.users.updateByID(options)).resolves.toBeNull();
    expect(domainEvents.events).toHaveLength(1);
    expect(domainEvents.events[0]).toMatchObject({
      subject: "user.updated",
      source: "user-profile",
      actor: performedBy,
      correlationId: eventContext.correlationId,
      data: { previous: user, current },
    });
  });

  it("emits role create, update, and delete events in mutation order", async () => {
    identity.roles.create.mockResolvedValue({ current: previousRole, performedBy });
    identity.roles.updateByID.mockResolvedValue({
      previous: previousRole,
      current: currentRole,
      changed: true,
      performedBy,
    });
    identity.roles.deleteByID.mockResolvedValue({ previous: currentRole, performedBy });
    const decorated = decorateIdentityWithEvents(identity, domainEvents.emitter);

    await decorated.roles.create(
      { name: previousRole.name, permissions: previousRole.permissions },
      eventContext,
    );
    await decorated.roles.updateByID({
      id: previousRole.id,
      role: { name: currentRole.name, permissions: currentRole.permissions },
      eventContext,
    });
    await decorated.roles.deleteByID(currentRole.id, eventContext);

    expect(domainEvents.subjects()).toEqual(["role.created", "role.updated", "role.deleted"]);
    expect(domainEvents.events).toEqual([
      expect.objectContaining({
        subject: "role.created",
        source: "role",
        actor: performedBy,
        correlationId: eventContext.correlationId,
        data: { role: previousRole },
      }),
      expect.objectContaining({
        subject: "role.updated",
        source: "role",
        actor: performedBy,
        correlationId: eventContext.correlationId,
        data: { previous: previousRole, current: currentRole },
      }),
      expect.objectContaining({
        subject: "role.deleted",
        source: "role",
        actor: performedBy,
        correlationId: eventContext.correlationId,
        data: { role: currentRole },
      }),
    ]);
  });

  it("suppresses unchanged role update events", async () => {
    identity.roles.updateByID.mockResolvedValue({
      previous: previousRole,
      current: previousRole,
      changed: false,
      performedBy,
    });
    const decorated = decorateIdentityWithEvents(identity, domainEvents.emitter);

    await expect(
      decorated.roles.updateByID({
        id: previousRole.id,
        role: { name: previousRole.name, permissions: previousRole.permissions },
        eventContext,
      }),
    ).resolves.toEqual(previousRole);
    expect(domainEvents.events).toEqual([]);
  });

  it("requires explicit audit attribution before mutating", async () => {
    const decorated = decorateIdentityWithEvents(identity, domainEvents.emitter);

    await expect(
      decorated.roles.deleteByID(previousRole.id, { correlationId: "missing-actor" }),
    ).rejects.toThrow("identity mutations require an authenticated actor");
    expect(identity.roles.deleteByID).not.toHaveBeenCalled();
  });

  it("passes authorization through unchanged", () => {
    const decorated = decorateIdentityWithEvents(identity, domainEvents.emitter);

    expect(decorated.authorization).toBe(identity.authorization);
  });
});
