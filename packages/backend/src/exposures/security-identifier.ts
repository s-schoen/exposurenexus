const cvePattern = /^cve-(\d{4})-(\d{4,})$/iu;
const cwePattern = /^(?:cwe-)?(\d+)$/iu;
const ghsaPattern = /^ghsa-([a-z\d]{4})-([a-z\d]{4})-([a-z\d]{4})$/iu;

export type KnownSecurityIdentifierNamespace = "cve" | "cwe" | "ghsa";

export function canonicalizeKnownSecurityIdentifier(
  namespace: KnownSecurityIdentifierNamespace,
  identifier: string,
): string {
  const trimmed = identifier.trim();

  switch (namespace) {
    case "cve": {
      const match = cvePattern.exec(trimmed);
      if (!match) {
        throw new Error("CVE identifiers must use the CVE-YYYY-NNNN format.");
      }
      return `CVE-${match[1]}-${match[2]}`;
    }
    case "cwe": {
      const match = cwePattern.exec(trimmed);
      if (!match) {
        throw new Error("CWE identifiers must use the CWE-N format.");
      }
      return `CWE-${match[1]}`;
    }
    case "ghsa": {
      const match = ghsaPattern.exec(trimmed);
      if (!match) {
        throw new Error("GHSA identifiers must use the GHSA-XXXX-XXXX-XXXX format.");
      }
      return `GHSA-${match[1].toUpperCase()}-${match[2].toUpperCase()}-${match[3].toUpperCase()}`;
    }
  }
}
