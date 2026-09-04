import { useMutation } from "@tanstack/react-query";

import {
  createVulnerability,
  deleteVulnerability,
  updateVulnerability,
} from "@/features/vulnerabilities/api/vulnerabilities.ts";

import type { VulnerabilityInput } from "@exposurenexus/contracts/model/vulnerability";

export function useCreateVulnerabilityMutation() {
  return useMutation({
    mutationFn: (vulnerability: VulnerabilityInput) => createVulnerability(vulnerability),
  });
}

export function useUpdateVulnerabilityMutation() {
  return useMutation({
    mutationFn: ({ id, vulnerability }: { id: string; vulnerability: VulnerabilityInput }) =>
      updateVulnerability(id, vulnerability),
  });
}

export function useDeleteVulnerabilityMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteVulnerability(id),
  });
}
