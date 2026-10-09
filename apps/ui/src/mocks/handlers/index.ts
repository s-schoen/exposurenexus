import { createAssetHandlers } from "@/mocks/handlers/assets.ts";
import { createAuthHandlers } from "@/mocks/handlers/auth.ts";
import { createCustomFieldHandlers } from "@/mocks/handlers/custom-fields.ts";
import { createFindingHandlers } from "@/mocks/handlers/findings.ts";
import { createRoleHandlers, createUserHandlers } from "@/mocks/handlers/identity.ts";
import { createVulnerabilityHandlers } from "@/mocks/handlers/vulnerabilities.ts";

import type { MockDb } from "@/mocks/db.ts";

/** Every API handler, backed by `db`. Order matters: auth (with its session guard) runs first. */
export function createHandlers(db: MockDb) {
  return [
    ...createAuthHandlers(db),
    ...createCustomFieldHandlers(db),
    ...createAssetHandlers(db),
    ...createFindingHandlers(db),
    ...createVulnerabilityHandlers(db),
    ...createUserHandlers(db),
    ...createRoleHandlers(db),
  ];
}
