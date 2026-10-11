import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { Info } from "lucide-react";

import { formatSeverity } from "@/features/vulnerabilities/lib/severity.ts";
import { cn } from "@/lib/utils.ts";

const severityIconClasses = {
  [VulnerabilitySeverity.Info]: "text-severity-info",
  [VulnerabilitySeverity.Low]: "text-severity-low",
  [VulnerabilitySeverity.Medium]: "text-severity-medium",
  [VulnerabilitySeverity.High]: "text-severity-high",
  [VulnerabilitySeverity.Critical]: "text-severity-critical",
} satisfies Record<VulnerabilitySeverity, string>;

// Lit bars per severity on Plane's three-bar priority signal.
const severityBars = {
  [VulnerabilitySeverity.Low]: 1,
  [VulnerabilitySeverity.Medium]: 2,
  [VulnerabilitySeverity.High]: 3,
} as const;

const bars = [
  { x: 2, y: 9, height: 5 },
  { x: 6.5, y: 5.5, height: 8.5 },
  { x: 11, y: 2, height: 12 },
];

interface SeverityIconProps {
  severity: VulnerabilitySeverity;
  /** Hide the icon from assistive technology when a visible label sits next to it. */
  decorative?: boolean;
  className?: string;
}

/** Plane's priority icon: "!" square for critical, signal bars for high to low, info glyph for info. */
export function SeverityIcon({ severity, decorative = false, className }: SeverityIconProps) {
  const a11yProps = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": formatSeverity(severity) };
  const classes = cn("size-4 shrink-0", severityIconClasses[severity], className);

  if (severity === VulnerabilitySeverity.Info) {
    return <Info strokeWidth={1.5} className={classes} {...a11yProps} />;
  }

  return (
    <svg viewBox="0 0 16 16" fill="none" className={classes} {...a11yProps}>
      {severity === VulnerabilitySeverity.Critical ? (
        <>
          <rect x="1" y="1" width="14" height="14" rx="3" className="fill-current" />
          <rect x="7.25" y="3.75" width="1.5" height="5.5" rx="0.75" className="fill-card" />
          <circle cx="8" cy="11.5" r="1" className="fill-card" />
        </>
      ) : (
        bars.map((bar, index) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width="3"
            height={bar.height}
            rx="0.75"
            className={index < severityBars[severity] ? "fill-current" : "fill-severity-unlit"}
          />
        ))
      )}
    </svg>
  );
}
