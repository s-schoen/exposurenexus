import { AssetIdentifierValidationReason } from "@exposurenexus/contracts/model/asset-identifier";

import {
  failure,
  finishValue,
  invalidControlOrWhitespacePattern,
  invalidFormat,
} from "@/lib/asset-identifier/normalization-result";

import type { NormalizationResult } from "@/lib/asset-identifier/normalization-result";

export function parseIPv4(value: string): Array<number> | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) {
    return null;
  }

  const octets = parts.map(Number);
  if (
    parts.some((part, index) => (part.length > 1 && part.startsWith("0")) || octets[index] > 255)
  ) {
    return null;
  }

  return octets;
}

function parseIPv6Part(part: string): Array<number> | null {
  if (part.length === 0) {
    return [];
  }

  const parts = part.split(":");
  if (parts.some((item) => item.length === 0)) {
    return null;
  }

  const values: Array<number> = [];
  for (const [index, item] of parts.entries()) {
    if (item.includes(".")) {
      if (index !== parts.length - 1) {
        return null;
      }

      const ipv4 = parseIPv4(item);
      if (ipv4 === null) {
        return null;
      }
      values.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      continue;
    }

    if (!/^[\da-f]{1,4}$/iu.test(item)) {
      return null;
    }
    values.push(Number.parseInt(item, 16));
  }

  return values;
}

function parseIPv6(value: string): Array<number> | null {
  const compression = value.indexOf("::");
  if (compression !== -1 && value.indexOf("::", compression + 2) !== -1) {
    return null;
  }

  if (compression === -1) {
    const parsed = parseIPv6Part(value);
    return parsed?.length === 8 ? parsed : null;
  }

  const left = parseIPv6Part(value.slice(0, compression));
  const right = parseIPv6Part(value.slice(compression + 2));
  if (left === null || right === null || left.length + right.length >= 8) {
    return null;
  }

  return [...left, ...Array.from({ length: 8 - left.length - right.length }, () => 0), ...right];
}

function formatIPv6(parts: Array<number>): string {
  const values = parts.map((part) => part.toString(16));
  let bestStart = -1;
  let bestLength = 1;

  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index] !== 0) {
      continue;
    }

    let end = index;
    while (end < parts.length && parts[end] === 0) {
      end += 1;
    }

    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end - 1;
  }

  if (bestStart === -1) {
    return values.join(":");
  }

  const before = values.slice(0, bestStart).join(":");
  const after = values.slice(bestStart + bestLength).join(":");
  if (before.length === 0 && after.length === 0) {
    return "::";
  }
  if (before.length === 0) {
    return `::${after}`;
  }
  if (after.length === 0) {
    return `${before}::`;
  }
  return `${before}::${after}`;
}

export function normalizeIpAddress(value: string): NormalizationResult {
  if (value.length === 0) {
    return failure(
      AssetIdentifierValidationReason.Empty,
      "empty",
      "IP addresses must not be empty.",
    );
  }

  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(value)) {
    return invalidFormat("ip_scheme", "IP addresses must not contain a scheme.");
  }
  if (value.includes("/")) {
    return invalidFormat("ip_cidr", "IP addresses must not contain CIDR ranges.");
  }
  if (value.includes("%")) {
    return invalidFormat("ip_zone", "IP addresses must not contain zone identifiers.");
  }
  if (value.includes("[") || value.includes("]") || /\d\.\d\.\d\.\d:\d+$/u.test(value)) {
    return invalidFormat("ip_port", "IP addresses must not contain ports or URI brackets.");
  }
  if (/[?#\\]/u.test(value) || invalidControlOrWhitespacePattern.test(value)) {
    return invalidFormat("ip_syntax", "IP addresses must use address syntax only.");
  }

  const ipv4 = parseIPv4(value);
  if (ipv4 !== null) {
    return finishValue(ipv4.join("."), "ip_value");
  }

  const ipv6 = parseIPv6(value);
  if (ipv6 === null) {
    return invalidFormat("ip_syntax", "IP addresses must be valid IPv4 or IPv6 addresses.");
  }

  return finishValue(formatIPv6(ipv6), "ip_value");
}
