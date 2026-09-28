import { describe, expect, it } from "vitest";

import { parseSarif } from "./parser.js";

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const report = (run: Record<string, unknown> = {}) => ({
  version: "2.1.0",
  runs: [{ tool: { driver: { name: "Other scanner" } }, ...run }],
});

describe("parseSarif", () => {
  it("accepts non-ZAP reports offline, preserving raw fields and unresolved references", () => {
    const raw = {
      ...report({
        properties: { unknown: [null, { default: "verbatim" }] },
        artifacts: [{ location: { uri: "src/app.ts", uriBaseId: "ROOT" } }],
        originalUriBaseIds: { ROOT: { uri: "file:///workspace/" } },
        results: [
          {
            ruleId: "opaque",
            ruleIndex: 42,
            rule: { id: "unresolved", index: 3 },
            message: { text: "message" },
            locations: [{ physicalLocation: { artifactLocation: { index: 0 } } }],
          },
        ],
      }),
      $schema: "https://offline.invalid/unavailable-schema.json",
    };
    const parsed = parseSarif(bytes(raw));
    expect(parsed).toEqual(raw);
    expect(parsed.runs?.[0].results?.[0]).not.toHaveProperty("kind");
    expect(parsed.runs?.[0].results?.[0]).not.toHaveProperty("level");
  });

  it.each([null, []].map((runs) => ({ runs })))("accepts schema-valid runs $runs", ({ runs }) => {
    expect(parseSarif(bytes({ version: "2.1.0", runs }))).toEqual({ version: "2.1.0", runs });
  });

  it.each(["", " \n", "{", '{"SECRET":'])("rejects blank or malformed JSON safely", (input) => {
    expect(() => parseSarif(new TextEncoder().encode(input))).toThrow("sarif: invalid JSON");
  });

  it.each([
    { version: "2.0.0", runs: [] },
    { version: "2.1.0" },
    report({ results: null }),
    report({ results: [{ message: { text: "SECRET" }, level: "SECRET" }] }),
    report({ results: [{ message: { text: "SECRET" }, rank: "10" }] }),
    report({
      results: [
        {
          message: { text: "SECRET" },
          locations: [{ physicalLocation: { region: { startLine: 0 } } }],
        },
      ],
    }),
    report({ invocations: [{ executionSuccessful: true, startTimeUtc: "SECRET" }] }),
    report({ invocations: [{ executionSuccessful: true, startTimeUtc: "2026-01-01T12:30Z" }] }),
    report({ invocations: [{ executionSuccessful: true, startTimeUtc: "2026-02-30T00:00:00Z" }] }),
    report({ tool: { driver: { name: "Other", informationUri: "relative" } } }),
    report({ results: [{ message: { text: "SECRET" }, unexpected: true }] }),
    report({
      results: [
        { message: { text: "SECRET" }, suppressions: [{ kind: "external", status: "invalid" }] },
      ],
    }),
    report({
      tool: {
        driver: {
          name: "Other",
          rules: [{ id: "x", properties: { tags: ["duplicate", "duplicate"] } }],
        },
      },
    }),
  ])("rejects complete-document schema violations without source leakage (%#)", (raw) => {
    expect(() => parseSarif(bytes(raw))).toThrow(/^sarif: schema validation failed at \//u);
    try {
      parseSarif(bytes(raw));
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain("SECRET");
    }
  });

  it.each([
    "../relative?x=1#fragment",
    "",
    "#fragment",
    "//example.com/a",
    "https://[2001:db8::1]/a",
    "urn:example:thing",
    "file:///tmp/file",
    "https://example.com/%20",
  ])("accepts RFC URI reference %j", (uri) => {
    expect(() => parseSarif(bytes(report({ artifacts: [{ location: { uri } }] })))).not.toThrow();
  });

  it.each([
    "https://example.com/a b",
    "https://example.com/%XX",
    "https://[invalid]/",
    "https://example.com\\path",
    "1invalid:foo",
  ])("rejects invalid URI reference %j", (uri) => {
    expect(() => parseSarif(bytes(report({ artifacts: [{ location: { uri } }] })))).toThrow();
  });

  it("does not leak arbitrary map keys in format diagnostics", () => {
    const raw = report({ originalUriBaseIds: { SECRET: { uri: "not a uri" } } });
    expect(() => parseSarif(bytes(raw))).toThrow();
    try {
      parseSarif(bytes(raw));
    } catch (error) {
      expect(String(error)).not.toContain("SECRET");
    }
  });

  it("rejects invalid UTF-8", () => {
    expect(() => parseSarif(new Uint8Array([0xff]))).toThrow("invalid JSON or UTF-8");
  });

  it.each([
    { message: {} },
    { message: { id: "m" }, rule: {} },
    { message: { id: "m" }, locations: [{ physicalLocation: {} }] },
    { message: { id: "m" }, graphTraversals: [{}] },
    { message: { id: "m" }, graphTraversals: [{ runGraphIndex: 0, resultGraphIndex: 0 }] },
  ])("enforces required alternatives (%#)", (result) => {
    expect(() => parseSarif(bytes(report({ results: [result] })))).toThrow(
      "schema validation failed",
    );
  });

  it.each([{ runGraphIndex: 0 }, { resultGraphIndex: 0 }])(
    "accepts exactly one graph index: %j",
    (traversal) => {
      const raw = report({ results: [{ message: { id: "m" }, graphTraversals: [traversal] }] });
      expect(parseSarif(bytes(raw))).toEqual(raw);
    },
  );

  it.each([
    { message: { text: "ok", extra: true } },
    { message: { id: "m" }, graphTraversals: [{ runGraphIndex: 0, extra: true }] },
    { message: { id: "m" }, rule: { id: "rule", extra: true } },
    {
      message: { id: "m" },
      locations: [{ physicalLocation: { artifactLocation: { uri: "a" }, extra: true } }],
    },
    {
      message: { id: "m" },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: "a" },
            region: { startLine: 1, extra: true },
          },
        },
      ],
    },
  ])("rejects undeclared fields in closed schemas with alternatives (%#)", (result) => {
    expect(() => parseSarif(bytes(report({ results: [result] })))).toThrow(
      "schema validation failed",
    );
  });

  it("still allows arbitrary property-bag fields in composed schemas", () => {
    const raw = report({
      results: [
        {
          message: { text: "ok", properties: { extra: true } },
          graphTraversals: [{ runGraphIndex: 0, properties: { extra: true } }],
        },
      ],
    });
    expect(parseSarif(bytes(raw))).toEqual(raw);
  });

  it.each(["__proto__", "constructor", "toString"])(
    "validates every own map entry named %s",
    (key) => {
      const valid = report({
        results: [{ message: { id: "m" }, webRequest: { headers: { [key]: "verbatim" } } }],
      });
      expect(parseSarif(bytes(valid))).toEqual(valid);
      const invalid = report({
        results: [
          { message: { id: "m" }, webRequest: { headers: { [key]: { not: "a string" } } } },
        ],
      });
      expect(() => parseSarif(bytes(invalid))).toThrow("schema validation failed");
    },
  );

  it("validates nested structures under __proto__ map entries", () => {
    const valid = report({ originalUriBaseIds: { ["__proto__"]: { uri: "../relative" } } });
    expect(parseSarif(bytes(valid))).toEqual(valid);
    const invalid = report({ originalUriBaseIds: { ["__proto__"]: { uri: "not a uri" } } });
    expect(() => parseSarif(bytes(invalid))).toThrow("schema validation failed");
  });

  it("allows __proto__ property-bag data but rejects it on closed standard objects", () => {
    const raw = report({ properties: { ["__proto__"]: { arbitrary: true } } });
    expect(parseSarif(bytes(raw))).toEqual(raw);
    expect(() => parseSarif(bytes(report({ ["__proto__"]: "unexpected" })))).toThrow(
      "schema validation failed",
    );
  });

  it("accepts representable integers beyond the safe-integer range without coercion", () => {
    const raw = report({ addresses: [{ absoluteAddress: 9007199254740992 }] });
    expect(parseSarif(bytes(raw))).toEqual(raw);
  });

  it.each([-2, 1.5, 1.0000000000000002, 1e-16, 1000000000000000.5])(
    "retains explicit integer bounds and integrality for %j",
    (absoluteAddress) => {
      expect(() => parseSarif(bytes(report({ addresses: [{ absoluteAddress }] })))).toThrow(
        "schema validation failed",
      );
    },
  );

  it.each([
    "2026-01-01t12:30:00z",
    "2016-12-31T23:59:60Z",
    "2017-01-01T00:59:60+01:00",
    "2016-12-31T18:59:60-05:00",
    "2017-01-01T05:29:60+05:30",
    "2016-07-01T00:59:60+01:00",
    "2024-02-29T12:30:00.123456+05:30",
  ])("preserves RFC 3339 timestamp %s", (startTimeUtc) => {
    const raw = report({ invocations: [{ executionSuccessful: true, startTimeUtc }] });
    expect(parseSarif(bytes(raw))).toEqual(raw);
  });

  it.each([
    "2026-01-01T12:30Z",
    "2026-02-29T12:30:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T12:30:00+24:00",
    "2026-01-01T12:30:00+01:60",
    "2016-12-31T12:30:60Z",
    "2016-12-30T23:59:60Z",
    "2017-01-02T00:59:60+01:00",
    "2016-12-31T00:59:60+01:00",
    "2016-12-30T18:59:60-05:00",
  ])("rejects invalid RFC 3339 timestamp %s", (startTimeUtc) => {
    expect(() =>
      parseSarif(bytes(report({ invocations: [{ executionSuccessful: true, startTimeUtc }] }))),
    ).toThrow("schema validation failed");
  });

  it.each([
    "https://[::ffff:192.0.2.1]/",
    "https://[0:0:0:0:0:ffff:192.0.2.1]/",
    "https://[2001:db8::192.0.2.1]/",
    "https://[::192.0.2.1]/",
  ])("accepts IPv4-embedded IPv6 URI %s", (uri) => {
    const raw = report({ artifacts: [{ location: { uri } }] });
    expect(parseSarif(bytes(raw))).toEqual(raw);
  });

  it.each([
    "https://[::ffff:192.0.2.256]/",
    "https://[0:0:0:0:ffff:192.0.2.1]/",
    "https://[0:0:0:0:0:0:ffff:192.0.2.1]/",
    "https://[::ffff:192.0.2.01]/",
  ])("rejects invalid IPv4-embedded IPv6 URI %s", (uri) => {
    expect(() => parseSarif(bytes(report({ artifacts: [{ location: { uri } }] })))).toThrow(
      "schema validation failed",
    );
  });
});
