import { isIP } from "node:net";

interface SourceIpInput {
  remoteAddress?: string | null;
  forwardedFor?: string | null;
  realIp?: string | null;
  trustedProxies?: readonly string[];
}

interface ParsedIp {
  version: 4 | 6;
  value: number | bigint;
}

interface ParsedTrustedProxy {
  ip: ParsedIp;
  prefixLength: number;
}

function normalizeIp(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.startsWith("::ffff:")) {
    const mappedIpv4 = trimmedValue.slice("::ffff:".length);
    if (isIP(mappedIpv4) === 4) {
      return mappedIpv4;
    }
  }

  return isIP(trimmedValue) === 0 ? null : trimmedValue.toLowerCase();
}

function parseIpv4(ip: string): number | null {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp || isIP(normalizedIp) !== 4) {
    return null;
  }

  return (
    normalizedIp
      .split(".")
      .map(Number)
      .reduce((value, octet) => (value << 8) + octet, 0) >>> 0
  );
}

function parseIpv6(ip: string): bigint | null {
  const normalizedIp = normalizeIp(ip);
  if (!normalizedIp || isIP(normalizedIp) !== 6) {
    return null;
  }

  const [left = "", right = ""] = normalizedIp.split("::", 2);
  const leftParts = left.length > 0 ? left.split(":") : [];
  const rightParts = right.length > 0 ? right.split(":") : [];
  const zeroFill = 8 - leftParts.length - rightParts.length;

  if (zeroFill < 0) {
    return null;
  }

  const parts = [...leftParts, ...Array<string>(zeroFill).fill("0"), ...rightParts];

  if (parts.length !== 8) {
    return null;
  }

  return parts.reduce((value, part) => {
    const parsedPart = Number.parseInt(part, 16);
    return (value << 16n) + BigInt(parsedPart);
  }, 0n);
}

function parseIp(ip: string): ParsedIp | null {
  const ipv4 = parseIpv4(ip);
  if (ipv4 !== null) {
    return {
      version: 4,
      value: ipv4,
    };
  }

  const ipv6 = parseIpv6(ip);
  if (ipv6 !== null) {
    return {
      version: 6,
      value: ipv6,
    };
  }

  return null;
}

function parseTrustedProxy(value: string): ParsedTrustedProxy | null {
  const [ipValue, prefixValue] = value.split("/", 2);
  const ip = parseIp(ipValue ?? "");
  if (!ip) {
    return null;
  }

  const maxPrefixLength = ip.version === 4 ? 32 : 128;
  const prefixLength =
    prefixValue === undefined
      ? maxPrefixLength
      : /^\d+$/.test(prefixValue)
        ? Number.parseInt(prefixValue, 10)
        : Number.NaN;

  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > maxPrefixLength) {
    return null;
  }

  return {
    ip,
    prefixLength,
  };
}

function matchesTrustedProxy(ip: ParsedIp, trustedProxy: ParsedTrustedProxy) {
  if (ip.version !== trustedProxy.ip.version) {
    return false;
  }

  const bitLength = ip.version === 4 ? 32 : 128;
  const shift = BigInt(bitLength - trustedProxy.prefixLength);
  const ipValue = BigInt(ip.value);
  const trustedProxyValue = BigInt(trustedProxy.ip.value);

  return ipValue >> shift === trustedProxyValue >> shift;
}

export function isValidTrustedProxy(value: string): boolean {
  return parseTrustedProxy(value) !== null;
}

export function isTrustedProxy(
  remoteAddress: string | null | undefined,
  trustedProxies: readonly string[],
): boolean {
  const remoteIp = parseIp(remoteAddress ?? "");
  if (!remoteIp) {
    return false;
  }

  return trustedProxies.some((trustedProxy) => {
    const parsedTrustedProxy = parseTrustedProxy(trustedProxy);
    return parsedTrustedProxy !== null && matchesTrustedProxy(remoteIp, parsedTrustedProxy);
  });
}

export function resolveRequestSourceIp({
  remoteAddress,
  forwardedFor,
  realIp,
  trustedProxies = [],
}: SourceIpInput): string {
  const normalizedRemoteAddress = normalizeIp(remoteAddress);

  if (isTrustedProxy(normalizedRemoteAddress, trustedProxies)) {
    const firstForwardedIp = forwardedFor?.split(",", 1)[0]?.trim();
    const normalizedForwardedIp = normalizeIp(firstForwardedIp);
    if (normalizedForwardedIp) {
      return normalizedForwardedIp;
    }

    const normalizedRealIp = normalizeIp(realIp);
    if (normalizedRealIp) {
      return normalizedRealIp;
    }
  }

  return normalizedRemoteAddress ?? "unknown";
}
