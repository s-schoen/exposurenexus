import { FindingStatusIcon } from "@/features/findings/components/finding-status-icon.tsx";
import { formatFindingStatus } from "@/features/findings/lib/format.ts";

import type { FindingStatus } from "@exposurenexus/contracts/model/finding";

/** Status icon and name, for pickers and property values; the parent's flex gap spaces them. */
export function FindingStatusLabel({ status }: { status: FindingStatus }) {
  return (
    <>
      <FindingStatusIcon status={status} decorative />
      {formatFindingStatus(status)}
    </>
  );
}
