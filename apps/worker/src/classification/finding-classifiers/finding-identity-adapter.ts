import { assertFindingIdentities } from "./finding-index.js";

import type { FindingIdentitySource } from "./identity-matcher.js";
import type { Findings } from "@exposurenexus/backend/findings";

/**
 * Adapts the backend finding identity read for {@link IdentityFindingMatcher}.
 *
 * @throws An `Error` from `listFindings` when the response violates the finding identity
 * invariants, such as a finding on another asset or a repeated ID.
 */
export function findingIdentitySourceFrom(
  findings: Pick<Findings, "listIdentities">,
): FindingIdentitySource {
  return {
    async listFindings(assetId) {
      const identities = await findings.listIdentities(assetId);
      assertFindingIdentities(assetId, identities);
      return identities;
    },
  };
}
