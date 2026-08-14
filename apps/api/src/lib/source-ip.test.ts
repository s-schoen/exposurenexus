import { describe, expect, it } from "vitest";

import { isTrustedProxy, isValidTrustedProxy, resolveRequestSourceIp } from "./source-ip.js";

describe("source ip helpers", () => {
  it("ignores forwarding headers when the remote address is not trusted", () => {
    expect(
      resolveRequestSourceIp({
        remoteAddress: "198.51.100.20",
        forwardedFor: "203.0.113.10, 198.51.100.1",
        realIp: "203.0.113.11",
        trustedProxies: ["10.0.0.0/8"],
      }),
    ).toBe("198.51.100.20");
  });

  it("uses x-forwarded-for from trusted proxies", () => {
    expect(
      resolveRequestSourceIp({
        remoteAddress: "10.1.2.3",
        forwardedFor: "203.0.113.10, 198.51.100.1",
        realIp: "203.0.113.11",
        trustedProxies: ["10.0.0.0/8"],
      }),
    ).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip from trusted proxies", () => {
    expect(
      resolveRequestSourceIp({
        remoteAddress: "10.1.2.3",
        forwardedFor: "not-an-ip",
        realIp: "203.0.113.11",
        trustedProxies: ["10.0.0.0/8"],
      }),
    ).toBe("203.0.113.11");
  });

  it("normalizes IPv4-mapped remote addresses before trust checks", () => {
    expect(
      resolveRequestSourceIp({
        remoteAddress: "::ffff:127.0.0.1",
        forwardedFor: "203.0.113.10",
        trustedProxies: ["127.0.0.1"],
      }),
    ).toBe("203.0.113.10");
  });

  it("matches exact IPv6 and IPv6 CIDR trusted proxies", () => {
    expect(isTrustedProxy("::1", ["::1"])).toBe(true);
    expect(isTrustedProxy("2001:db8::abcd", ["2001:db8::/32"])).toBe(true);
    expect(isTrustedProxy("2001:db9::abcd", ["2001:db8::/32"])).toBe(false);
  });

  it("validates trusted proxy configuration entries", () => {
    expect(isValidTrustedProxy("127.0.0.1")).toBe(true);
    expect(isValidTrustedProxy("10.0.0.0/8")).toBe(true);
    expect(isValidTrustedProxy("::1/128")).toBe(true);
    expect(isValidTrustedProxy("10.0.0.0/33")).toBe(false);
    expect(isValidTrustedProxy("10.0.0.0/8abc")).toBe(false);
    expect(isValidTrustedProxy("not-an-ip")).toBe(false);
  });
});
