import { AssetIdentifierValidationReason } from "@exposurenexus/contracts/model/asset-identifier";

import { parseIPv4 } from "@/lib/asset-identifier/ip-address";
import {
  failure,
  finishValue,
  invalidControlOrWhitespacePattern,
  invalidFormat,
  schemePattern,
} from "@/lib/asset-identifier/normalization-result";

import type { NormalizationResult } from "@/lib/asset-identifier/normalization-result";

export function normalizeDnsName(value: string): NormalizationResult {
  if (value.length === 0) {
    return failure(AssetIdentifierValidationReason.Empty, "empty", "DNS names must not be empty.");
  }

  if (schemePattern.test(value)) {
    return invalidFormat("dns_scheme", "DNS names must not contain a scheme.");
  }

  if (value.includes(":")) {
    return invalidFormat("dns_port", "DNS names must not contain ports.");
  }

  if (/[/?#\\@\x5b\x5d*%]/u.test(value)) {
    return invalidFormat("dns_syntax", "DNS names must contain hostname labels only.");
  }

  if (invalidControlOrWhitespacePattern.test(value)) {
    return invalidFormat(
      "dns_whitespace",
      "DNS names must not contain whitespace or control characters.",
    );
  }

  const trailingRootDots = value.match(/\.+$/u)?.[0].length ?? 0;
  if (trailingRootDots > 1) {
    return invalidFormat("dns_root_dot", "DNS names may contain at most one trailing root dot.");
  }

  const hostname = trailingRootDots === 1 ? value.slice(0, -1) : value;
  if (hostname.length === 0) {
    return failure(AssetIdentifierValidationReason.Empty, "empty", "DNS names must not be empty.");
  }

  let asciiHostname: string;
  try {
    asciiHostname = new URL(`http://${hostname}`).hostname;
  } catch {
    return invalidFormat("dns_syntax", "DNS names must use valid hostname syntax.");
  }

  if (asciiHostname.endsWith(".")) {
    asciiHostname = asciiHostname.slice(0, -1);
  }

  const labels = asciiHostname.split(".");
  if (
    asciiHostname.length === 0 ||
    asciiHostname.length > 253 ||
    labels.some(
      (label) =>
        label.length === 0 || label.length > 63 || !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/iu.test(label),
    )
  ) {
    return invalidFormat("dns_syntax", "DNS names must use valid hostname syntax.");
  }

  if (parseIPv4(asciiHostname) !== null) {
    return invalidFormat("dns_ip_address", "IP addresses must use the ipAddress identifier type.");
  }

  return finishValue(asciiHostname.toLowerCase(), "dns_value");
}
