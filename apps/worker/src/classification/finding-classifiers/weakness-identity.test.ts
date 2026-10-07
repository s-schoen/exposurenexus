import { describe, expect, it } from "vitest";

import { compareWeakness, specificNamespaces } from "./weakness-identity.js";

import type { Weakness } from "@exposurenexus/contracts/model/weakness";

function weakness(identifiers: Record<string, string[]>): Weakness {
  return { identifiers };
}

describe("compareWeakness", () => {
  it("treats an overlap in every shared specific namespace as the same weakness", () => {
    expect(
      compareWeakness(
        weakness({ cve: ["CVE-2026-1001"], trivy: ["CVE-2026-1001", "GHSA-AAAA-BBBB-CCCC"] }),
        weakness({ cve: ["CVE-2026-1001"], cwe: ["CWE-79"], trivy: ["CVE-2026-1001"] }),
      ),
    ).toEqual({ relation: "same", namespaces: ["cve", "trivy"] });
  });

  it("links CVE and GHSA aliases when either side carries both namespaces", () => {
    expect(
      compareWeakness(
        weakness({ cve: ["CVE-2026-1001"], ghsa: ["GHSA-AAAA-BBBB-CCCC"] }),
        weakness({ ghsa: ["GHSA-AAAA-BBBB-CCCC"] }),
      ),
    ).toEqual({ relation: "same", namespaces: ["ghsa"] });
  });

  it("treats a disagreeing shared namespace as a different weakness", () => {
    expect(
      compareWeakness(
        weakness({ "nuclei-matcher": ["template:a"], nuclei: ["template"] }),
        weakness({ "nuclei-matcher": ["template:b"], nuclei: ["template"] }),
      ).relation,
    ).toBe("none");
  });

  it("relates a CWE-only side through an overlapping CWE", () => {
    expect(
      compareWeakness(
        weakness({ cwe: ["CWE-89"], semgrep: ["sequelize-injection"] }),
        weakness({ cwe: ["CWE-89"] }),
      ),
    ).toEqual({ relation: "related", namespaces: ["cwe"] });
  });

  it("never links two specific weaknesses through a shared CWE", () => {
    expect(
      compareWeakness(
        weakness({ cwe: ["CWE-693"], zap: ["10021"] }),
        weakness({ cwe: ["CWE-693"], nuclei: ["missing-headers"] }),
      ).relation,
    ).toBe("none");
  });

  it("finds no relation without a shared namespace or with disjoint CWEs", () => {
    expect(
      compareWeakness(
        weakness({ cve: ["CVE-2026-1001"] }),
        weakness({ ghsa: ["GHSA-AAAA-BBBB-CCCC"] }),
      ).relation,
    ).toBe("none");
    expect(
      compareWeakness(weakness({ cwe: ["CWE-79"] }), weakness({ cwe: ["CWE-89"] })).relation,
    ).toBe("none");
    expect(compareWeakness(weakness({}), weakness({})).relation).toBe("none");
  });
});

describe("specificNamespaces", () => {
  it("lists non-empty namespaces other than CWE", () => {
    expect(
      specificNamespaces(weakness({ cve: ["CVE-2026-1001"], cwe: ["CWE-79"], zap: [] })),
    ).toEqual(["cve"]);
  });
});
