import type { Weakness } from "@exposurenexus/contracts/model/weakness";

export function formatWeaknessText(weakness: Pick<Weakness, "identifiers">): string {
  return Object.entries(weakness.identifiers)
    .map(([namespace, identifiers]) => `${namespace}=${identifiers.join(",")}`)
    .join("; ");
}

/**
 * Parses identifier text and keeps every other weakness field from `base`, so
 * edits to identifiers preserve reported references, CVSS, and EPSS values.
 */
export function parseWeaknessText(value: string, base?: Weakness): Weakness | null {
  const identifiers: Record<string, Array<string>> = {};

  for (const entry of value.split(";")) {
    if (!entry.trim()) {
      continue;
    }

    const separator = entry.indexOf("=");
    const namespace = entry.slice(0, separator).trim();
    const values = entry
      .slice(separator + 1)
      .split(",")
      .map((identifier) => identifier.trim())
      .filter(Boolean);

    if (separator < 1 || !namespace || values.length === 0) {
      return null;
    }

    identifiers[namespace] = values;
  }

  return { ...base, identifiers };
}
