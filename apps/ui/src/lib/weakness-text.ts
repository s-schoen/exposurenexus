import type { Weakness } from "@exposurenexus/types/model/weakness";

interface WeaknessTextInput {
  identifiers: Record<string, Array<string>>;
}

export function formatWeaknessText(weakness: Weakness): string {
  return Object.entries(weakness.identifiers)
    .map(([namespace, identifiers]) => `${namespace}=${identifiers.join(",")}`)
    .join("; ");
}

export function parseWeaknessText(value: string): WeaknessTextInput | null {
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

  return { identifiers };
}
