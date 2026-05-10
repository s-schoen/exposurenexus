# API Architecture

This document records API layer conventions for routes, services, and
repositories. It is not an endpoint reference.

## Layer Responsibilities

The API follows a hexagonal structure:

- Hono routes adapt HTTP requests, validation, replies, and authorization
  decisions.
- Domain services own application behavior, cross-aggregate rules, and domain
  event emission.
- Repositories adapt persistence and hide database query details.

Routes should stay thin. They validate request shape, require permissions, turn
Hono request context into application context, call services, and translate
service results into HTTP replies.

Services should not import Hono context or concrete route helpers. Repositories
should not own business rules that belong in services.

## Service Contracts

Routes use the full exported service contract from the owning service module.
For example, resource routes depend on `UserProfileService`, `FindingService`,
`RoleService`, `AssetService`, and `VulnerabilityService` instead of declaring
route-local service interfaces.

Service modules export their public service interface, and factory functions
return that interface. This keeps the service boundary explicit without
coupling routes to repository adapters or service implementation details.

Cross-service dependencies may still use narrow ports when the consuming
service only needs a small lookup capability. This does not contradict the
route rule: inbound HTTP adapters use full service contracts, while internal
service dependencies can stay purpose-specific.

## Repository Contracts

Repository contracts are persistence ports. Services depend on repository
interfaces exported by repository modules, not concrete repository factory
return types.

Repository method names use persistence vocabulary:

- `list`
- `getByID`
- `getByName` or `getByNames`
- `create`
- `updateByID`
- `deleteByID`

Services expose application vocabulary at their boundary. Use `listAll` for a
service method that returns every resource, even when the underlying repository
method is named `list`.

## Method Names

Use consistent identity-based names across services and repositories:

- Read by identity: `getByID`
- Update by identity: `updateByID`
- Delete by identity: `deleteByID`

Use explicit names for behavior that is not a plain create, read, update, or
delete operation. For example, finding imports use `createOrUpdate` because the
method performs upsert-like behavior based on a fingerprint.

## HTTP Update Semantics

API routes use `PUT` for full replacement of the addressed resource or
subresource. A `PUT` payload contains the complete client-editable state for
that target:

- omitted mutable fields are invalid;
- nullable mutable fields must be sent as either a value or `null`;
- server-owned and immutable fields are not accepted in the payload;
- collection subresources are replaced by the submitted collection, not patched
  or appended to.

Partial updates require a future `PATCH` endpoint with a separate schema and
explicit merge rules.

## Call Shapes

Use plain positional parameters for one or two arguments:

```ts
assetService.create(asset, eventContext);
assetService.deleteByID(id, eventContext);
```

Use an options object when a method needs more than two inputs, has multiple
optional inputs, or carries a domain payload plus actor/request context:

```ts
findingService.updateByID({
  id,
  finding,
  user,
  eventContext,
});
```

`eventContext` may be the second positional argument for simple methods.
Richer methods should include it inside the options object.

## Request Context

Routes create `DomainEventContext` with `requestEventContext(c)` and pass it
into services. Services do not read Hono context directly.

Domain services receive a `DomainEventEmitter` and create source-bound emit
helpers. They emit events with domain payloads and optional context, leaving
listener registration to the application container.

## Tests

Route tests should mock the full service contract used by the route. This
catches service API drift earlier than a narrow route-local test double.

Changing a service method name or call shape is a boundary change. Update the
service interface, routes, import adapters, and tests in the same slice.
