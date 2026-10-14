import { AssetLifecycleState } from "@exposurenexus/contracts/model/asset";
import { Activity, Archive } from "lucide-react";

import type { LucideIcon } from "lucide-react";

const assetLifecycleIcons = {
  [AssetLifecycleState.Active]: Activity,
  [AssetLifecycleState.Archived]: Archive,
} satisfies Record<AssetLifecycleState, LucideIcon>;

const assetLifecycleLabels = {
  [AssetLifecycleState.Active]: "Active",
  [AssetLifecycleState.Archived]: "Archived",
} satisfies Record<AssetLifecycleState, string>;

export function formatAssetLifecycleState(state: AssetLifecycleState) {
  return assetLifecycleLabels[state];
}

/** A lifecycle state's icon. Hidden from assistive technology: a label always sits next to it. */
export function AssetLifecycleIcon({ state }: { state: AssetLifecycleState }) {
  const Icon = assetLifecycleIcons[state];

  return (
    <Icon strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  );
}

/** Lifecycle icon and name, for chips, pickers and property values; the parent's gap spaces them. */
export function AssetLifecycleLabel({ state }: { state: AssetLifecycleState }) {
  return (
    <>
      <AssetLifecycleIcon state={state} />
      {formatAssetLifecycleState(state)}
    </>
  );
}
