import { SeverityIcon } from "@/features/vulnerabilities/components/severity-icon.tsx";
import { formatSeverity } from "@/features/vulnerabilities/lib/severity.ts";

import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

/** Severity icon and name, for pickers and property values; the parent's flex gap spaces them. */
export function SeverityLabel({ severity }: { severity: VulnerabilitySeverity }) {
  return (
    <>
      <SeverityIcon severity={severity} decorative />
      {formatSeverity(severity)}
    </>
  );
}
