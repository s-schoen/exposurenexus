import { identifierInventoryFrom } from "../asset-classifiers/asset-inventory-adapter.js";
import { IdentifierAssetMatcher } from "../asset-classifiers/identifier-matcher.js";

import type { MatcherFactory } from "./evaluate.js";

// Add evaluation-only factories here when concrete matchers exist. Keep setup lazy.
export const matchers: MatcherFactory[] = [
  {
    id: "identifier",
    requiresNetwork: false,
    create: (assets) =>
      new IdentifierAssetMatcher(
        identifierInventoryFrom({
          listAll: async () => [...assets],
          getByID: async (id) => assets.find((asset) => asset.id === id) ?? null,
        }),
      ),
  },
];
