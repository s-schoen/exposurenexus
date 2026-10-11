import { AssetType } from "@exposurenexus/contracts/model/asset";
import { AppWindow, Cloud, Container, Server } from "lucide-react";

import { formatAssetType } from "@/features/assets/lib/asset-type.ts";
import { cn } from "@/lib/utils.ts";

import type { LucideIcon } from "lucide-react";

const assetTypeIcons = {
  [AssetType.Host]: Server,
  [AssetType.Software]: AppWindow,
  [AssetType.ContainerImage]: Container,
  [AssetType.CloudResource]: Cloud,
} satisfies Record<AssetType, LucideIcon>;

interface AssetTypeIconProps {
  type: AssetType;
  /** Hide the icon from assistive technology when a visible label sits next to it. */
  decorative?: boolean;
  className?: string;
}

export function AssetTypeIcon({ type, decorative = false, className }: AssetTypeIconProps) {
  const Icon = assetTypeIcons[type];
  const a11yProps = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": formatAssetType(type) };

  return (
    <Icon
      strokeWidth={1.5}
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      {...a11yProps}
    />
  );
}
