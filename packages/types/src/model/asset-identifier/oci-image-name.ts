import { normalizeDnsName } from "./dns-name.js";
import { normalizeIpAddress, parseIPv4 } from "./ip-address.js";
import {
  failure,
  finishValue,
  invalidControlOrWhitespacePattern,
  invalidFormat,
  schemePattern,
  type NormalizationResult,
} from "./normalization-result.js";
import { AssetIdentifierValidationReason } from "./types.js";

function normalizeOciPort(port: string): NormalizationResult {
  if (!/^\d{1,5}$/u.test(port)) {
    return invalidFormat("oci_registry", "OCI registry ports must be valid TCP ports.");
  }
  const numericPort = Number(port);
  if (numericPort < 1 || numericPort > 65535) {
    return invalidFormat("oci_registry", "OCI registry ports must be valid TCP ports.");
  }
  return { success: true, value: String(numericPort) };
}

function normalizeOciRegistry(value: string): NormalizationResult {
  if (value.startsWith("[") && value.includes("]")) {
    const closeBracket = value.indexOf("]");
    const host = value.slice(1, closeBracket);
    const port = value.slice(closeBracket + 1);
    const normalizedIp = normalizeIpAddress(host);
    if (!normalizedIp.success || !normalizedIp.value.includes(":")) {
      return invalidFormat("oci_registry", "OCI registries must use valid host syntax.");
    }
    if (port.length === 0) {
      return { success: true, value: `[${normalizedIp.value}]` };
    }
    if (!port.startsWith(":")) {
      return invalidFormat("oci_registry", "OCI registries must use valid host syntax.");
    }
    const normalizedPort = normalizeOciPort(port.slice(1));
    return normalizedPort.success
      ? { success: true, value: `[${normalizedIp.value}]:${normalizedPort.value}` }
      : normalizedPort;
  }

  const separator = value.lastIndexOf(":");
  const hasPort = separator !== -1;
  const host = separator === -1 ? value : value.slice(0, separator);
  const port = separator === -1 ? "" : value.slice(separator + 1);
  if (host.length === 0 || host.includes(":")) {
    return invalidFormat("oci_registry", "OCI registries must use valid host syntax.");
  }

  const ipv4 = parseIPv4(host);
  const normalizedHost: NormalizationResult =
    ipv4 === null ? normalizeDnsName(host) : { success: true, value: ipv4.join(".") };
  if (!normalizedHost.success) {
    return invalidFormat("oci_registry", "OCI registries must use valid host syntax.");
  }
  if (!hasPort) {
    return { success: true, value: normalizedHost.value };
  }

  if (port.length === 0) {
    return invalidFormat("oci_registry", "OCI registry ports must not be empty.");
  }

  const normalizedPort = normalizeOciPort(port);
  return normalizedPort.success
    ? { success: true, value: `${normalizedHost.value}:${normalizedPort.value}` }
    : normalizedPort;
}

function normalizeOciRepositoryPart(value: string): NormalizationResult {
  const normalized = value.toLowerCase();
  if (!/^[a-z\d]+(?:(?:[._]|__|[-]+)[a-z\d]+)*$/u.test(normalized)) {
    return invalidFormat(
      "oci_repository",
      "OCI image names must use valid lowercase repository components.",
    );
  }
  return { success: true, value: normalized };
}

export function normalizeOciImageName(value: string): NormalizationResult {
  if (value.length === 0) {
    return failure(
      AssetIdentifierValidationReason.Empty,
      "empty",
      "OCI image names must not be empty.",
    );
  }
  if (schemePattern.test(value)) {
    return invalidFormat("oci_scheme", "OCI image names must not contain a scheme.");
  }
  if (/[\\?#%]/u.test(value) || invalidControlOrWhitespacePattern.test(value)) {
    return invalidFormat("oci_syntax", "OCI image names must not contain URLs or whitespace.");
  }
  if (value.includes("@")) {
    return invalidFormat("oci_digest", "OCI image names must not contain digests.");
  }

  const parts = value.split("/");
  if (parts.some((part) => part.length === 0)) {
    return invalidFormat(
      "oci_repository",
      "OCI image names must not contain empty path components.",
    );
  }

  const first = parts[0];
  if (parts.length === 1 && first.includes(":")) {
    return invalidFormat("oci_tag", "OCI image names must not contain tags.");
  }

  const qualified =
    first.toLowerCase() === "localhost" ||
    first.includes(".") ||
    first.includes(":") ||
    first.startsWith("[");
  let repositoryParts = parts;
  let registry: NormalizationResult = { success: true, value: "" };

  if (qualified) {
    if (parts.length < 2) {
      return invalidFormat(
        "oci_registry",
        "Qualified OCI image names must include a repository path.",
      );
    }
    registry = normalizeOciRegistry(first);
    repositoryParts = parts.slice(1);
  }

  if (repositoryParts.some((part) => part.includes(":"))) {
    return invalidFormat("oci_tag", "OCI image names must not contain tags.");
  }

  const normalizedRepositoryParts: string[] = [];
  for (const part of repositoryParts) {
    const normalizedPart = normalizeOciRepositoryPart(part);
    if (!normalizedPart.success) {
      return normalizedPart;
    }
    normalizedRepositoryParts.push(normalizedPart.value);
  }

  if (normalizedRepositoryParts.length === 0) {
    return invalidFormat("oci_repository", "OCI image names must include a repository path.");
  }

  const normalized = qualified
    ? `${registry.success ? registry.value : ""}/${normalizedRepositoryParts.join("/")}`
    : normalizedRepositoryParts.join("/");
  if (!registry.success) {
    return registry;
  }
  return finishValue(normalized, "oci_value");
}
