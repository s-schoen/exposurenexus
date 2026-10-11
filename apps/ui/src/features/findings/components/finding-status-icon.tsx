import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import { formatFindingStatus } from "@/features/findings/lib/format.ts";
import { cn } from "@/lib/utils.ts";

import type { ReactNode } from "react";

const findingStatusIconClasses = {
  [FindingStatus.Active]: "text-finding-status-active",
  [FindingStatus.Confirmed]: "text-finding-status-confirmed",
  [FindingStatus.Mitigated]: "text-finding-status-mitigated",
  [FindingStatus.FalsePositive]: "text-finding-status-false-positive",
  [FindingStatus.RiskAccepted]: "text-finding-status-risk-accepted",
  [FindingStatus.Duplicate]: "text-finding-status-duplicate",
  [FindingStatus.OutOfScope]: "text-finding-status-out-of-scope",
  [FindingStatus.Inactive]: "text-finding-status-inactive",
} satisfies Record<FindingStatus, string>;

const ring = <circle cx="8" cy="8" r="6" strokeWidth="1.5" className="stroke-current" />;

function filledCircle(glyph: string) {
  return (
    <>
      <circle cx="8" cy="8" r="7" className="fill-current" />
      <path
        d={glyph}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-card"
      />
    </>
  );
}

const halfFilled = (
  <>
    {ring}
    <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" className="fill-current" />
  </>
);
const check = filledCircle("M5.25 8.25 7 10l3.75-4");
const minus = filledCircle("M5 8h6");
const cross = filledCircle("m5.75 5.75 4.5 4.5m0-4.5-4.5 4.5");
const dashed = (
  <circle
    cx="8"
    cy="8"
    r="6"
    strokeWidth="1.5"
    pathLength={20}
    strokeDasharray="1.2 0.8"
    className="stroke-current"
  />
);

// Plane's state-group icons: unstarted, started, completed and cancelled, plus backlog for inactive.
const findingStatusGlyphs = {
  [FindingStatus.Active]: ring,
  [FindingStatus.Confirmed]: halfFilled,
  [FindingStatus.Mitigated]: check,
  [FindingStatus.RiskAccepted]: minus,
  [FindingStatus.FalsePositive]: cross,
  [FindingStatus.Duplicate]: cross,
  [FindingStatus.OutOfScope]: cross,
  [FindingStatus.Inactive]: dashed,
} satisfies Record<FindingStatus, ReactNode>;

interface FindingStatusIconProps {
  status: FindingStatus;
  /** Hide the icon from assistive technology when a visible label sits next to it. */
  decorative?: boolean;
  className?: string;
}

export function FindingStatusIcon({
  status,
  decorative = false,
  className,
}: FindingStatusIconProps) {
  const a11yProps = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": formatFindingStatus(status) };

  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-4 shrink-0", findingStatusIconClasses[status], className)}
      {...a11yProps}
    >
      {findingStatusGlyphs[status]}
    </svg>
  );
}
