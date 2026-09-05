import { AssetIdentifierValidationReason } from "@exposurenexus/contracts/model/asset-identifier";

import { normalizeDnsName } from "@/lib/asset-identifier/dns-name";
import { normalizeIpAddress, parseIPv4 } from "@/lib/asset-identifier/ip-address";
import {
  failure,
  finishValue,
  invalidControlOrWhitespacePattern,
  invalidFormat,
  schemePattern,
} from "@/lib/asset-identifier/normalization-result";

import type { NormalizationResult } from "@/lib/asset-identifier/normalization-result";

function normalizeVcsServer(
  hostname: string,
  port: string,
  protocol?: string,
): NormalizationResult {
  let host: string;
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const normalizedIp = normalizeIpAddress(hostname.slice(1, -1));
    if (!normalizedIp.success || !normalizedIp.value.includes(":")) {
      return invalidFormat("vcs_server", "VCS repository servers must use valid host syntax.");
    }
    host = `[${normalizedIp.value}]`;
  } else {
    const ipv4 = parseIPv4(hostname);
    if (ipv4 !== null) {
      host = ipv4.join(".");
    } else {
      const normalizedDns = normalizeDnsName(hostname);
      if (!normalizedDns.success) {
        return invalidFormat("vcs_server", "VCS repository servers must use valid host syntax.");
      }
      host = normalizedDns.value;
    }
  }

  if (
    port.length === 0 ||
    (protocol === "http" && port === "80") ||
    (protocol === "https" && port === "443") ||
    (protocol === "ssh" && port === "22")
  ) {
    return { success: true, value: host };
  }

  if (!/^\d{1,5}$/u.test(port)) {
    return invalidFormat("vcs_port", "VCS repository ports must be valid TCP ports.");
  }

  const numericPort = Number(port);
  if (numericPort < 1 || numericPort > 65535) {
    return invalidFormat("vcs_port", "VCS repository ports must be valid TCP ports.");
  }

  return { success: true, value: `${host}:${numericPort}` };
}

function normalizeVcsPath(rawPath: string): NormalizationResult {
  let path = rawPath;
  if (path.startsWith("/")) {
    path = path.slice(1);
  }
  if (path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("//") ||
    path.includes("\\") ||
    /[%?#]/u.test(path)
  ) {
    return invalidFormat(
      "vcs_repository_path",
      "VCS repositories must include a valid repository path.",
    );
  }

  const parts = path.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    return invalidFormat(
      "vcs_repository_path",
      "VCS repositories must not contain empty or relative path segments.",
    );
  }

  const lastPart = parts.at(-1)!;
  if (lastPart.endsWith(".git")) {
    parts[parts.length - 1] = lastPart.slice(0, -4);
  }

  if (parts.some((part) => part.length === 0)) {
    return invalidFormat("vcs_repository_path", "VCS repositories must include a repository path.");
  }

  return { success: true, value: parts.join("/") };
}

function isVcsRefPath(server: string, path: string): boolean {
  const host = server.startsWith("[") ? server.slice(1, server.indexOf("]")) : server.split(":")[0];
  const parts = path.split("/");
  const commonRefSegments = new Set([
    "actions",
    "blob",
    "branch",
    "branches",
    "commit",
    "commits",
    "compare",
    "heads",
    "issues",
    "merge_requests",
    "pull",
    "pull-requests",
    "pulls",
    "ref",
    "refs",
    "releases",
    "src",
    "tags",
    "tree",
  ]);

  const isGitHub = host === "github.com" || host === "www.github.com";
  const isBitbucket = host === "bitbucket.org" || host === "www.bitbucket.org";
  const isGitLab = host === "gitlab.com" || host === "www.gitlab.com";
  if (
    parts.length > 2 &&
    commonRefSegments.has(parts[2]) &&
    (isGitHub || isBitbucket || (!isGitLab && parts.length === 4))
  ) {
    return true;
  }

  if (isGitLab) {
    return parts.some(
      (part, index) => part === "-" && commonRefSegments.has(parts[index + 1] ?? ""),
    );
  }

  return false;
}

function finishVcsRepository(
  server: NormalizationResult,
  path: NormalizationResult,
): NormalizationResult {
  if (!server.success) {
    return server;
  }
  if (!path.success) {
    return path;
  }
  if (isVcsRefPath(server.value, path.value)) {
    return invalidFormat("vcs_ref", "VCS repository identifiers must not contain refs.");
  }
  return finishValue(`${server.value}/${path.value}`, "vcs_value");
}

function normalizeVcsUrl(value: string, protocol: string): NormalizationResult {
  const authorityEnd = value.indexOf("//") + 2;
  const pathStart = value.indexOf("/", authorityEnd);
  if (
    pathStart !== -1 &&
    value
      .slice(pathStart)
      .split(/[?#]/u, 1)[0]
      .split("/")
      .some((part) => part === "." || part === "..")
  ) {
    return invalidFormat(
      "vcs_repository_path",
      "VCS repositories must not contain relative path segments.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidFormat("vcs_url", "VCS repository URLs must be valid.");
  }

  if (protocol === "http" || protocol === "https") {
    if (url.username.length > 0 || url.password.length > 0) {
      return invalidFormat(
        "vcs_credentials",
        "HTTP(S) VCS repository URLs must not contain credentials.",
      );
    }
  } else if (url.password.length > 0) {
    return invalidFormat("vcs_credentials", "VCS repository URLs must not contain passwords.");
  }

  const server = normalizeVcsServer(url.hostname, url.port, protocol);
  return finishVcsRepository(server, normalizeVcsPath(url.pathname));
}

function normalizeVcsScp(value: string): NormalizationResult | null {
  let host: string;
  let path: string;

  const at = value.indexOf("@");
  const user = at === -1 ? undefined : value.slice(0, at);
  const hostStart = at === -1 ? 0 : at + 1;
  if (user !== undefined && (user.length === 0 || user.includes(":") || user.includes("/"))) {
    return null;
  }

  if (value[hostStart] === "[") {
    const closeBracket = value.indexOf("]:", hostStart);
    if (closeBracket === -1) {
      return null;
    }
    host = value.slice(hostStart, closeBracket + 1);
    path = value.slice(closeBracket + 2);
  } else {
    const separator = value.indexOf(":", hostStart);
    if (separator === -1) {
      return null;
    }

    host = value.slice(hostStart, separator);
    path = value.slice(separator + 1);
  }

  if (host.length === 0 || path.length === 0 || host.includes("/")) {
    return null;
  }

  const portMatch = at === -1 ? /^([^/]+):(\d+)\/(.*)$/u.exec(value) : null;
  if (portMatch) {
    const server = normalizeVcsServer(portMatch[1], portMatch[2]);
    return finishVcsRepository(server, normalizeVcsPath(`/${portMatch[3]}`));
  }

  const server = normalizeVcsServer(host, "");
  return finishVcsRepository(server, normalizeVcsPath(path));
}

export function normalizeVcsRepository(value: string): NormalizationResult {
  if (value.length === 0) {
    return failure(
      AssetIdentifierValidationReason.Empty,
      "empty",
      "VCS repository identifiers must not be empty.",
    );
  }
  if (invalidControlOrWhitespacePattern.test(value)) {
    return invalidFormat(
      "vcs_whitespace",
      "VCS repository identifiers must not contain whitespace or control characters.",
    );
  }
  if (value.includes("?") || value.includes("#")) {
    return invalidFormat(
      "vcs_query",
      "VCS repository identifiers must not contain query strings or fragments.",
    );
  }

  const scheme = schemePattern.exec(value)?.[1].toLowerCase();
  if (scheme !== undefined) {
    if (scheme !== "http" && scheme !== "https" && scheme !== "ssh") {
      return invalidFormat(
        "vcs_scheme",
        "VCS repository identifiers support SSH and HTTP(S) forms only.",
      );
    }
    return normalizeVcsUrl(value, scheme);
  }

  if (/^[a-z][a-z\d+.-]*:/iu.test(value) && normalizeVcsScp(value) === null) {
    return invalidFormat(
      "vcs_scheme",
      "VCS repository identifiers support SSH and HTTP(S) forms only.",
    );
  }

  const scp = normalizeVcsScp(value);
  if (scp !== null) {
    return scp;
  }

  const separator = value.indexOf("/");
  if (separator <= 0) {
    return invalidFormat(
      "vcs_repository_path",
      "VCS repository identifiers must include a server and repository path.",
    );
  }

  return finishVcsRepository(
    normalizeVcsServer(value.slice(0, separator), ""),
    normalizeVcsPath(value.slice(separator)),
  );
}
