import { AssetType } from "@exposurenexus/types/model/asset";
import { FindingSource, FindingStatus, type Finding } from "@exposurenexus/types/model/finding";
import {
  VulnerabilitySeverity,
  type Vulnerability,
  type VulnerabilitySourceMapping,
} from "@exposurenexus/types/model/vulnerability";
import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "../test/app.js";
import { createNucleiFindingParser } from "./nuclei.js";

import type { ApiError } from "../lib/api-error.js";

describe("nuclei importer", () => {
  const user = createTestUser();
  const ctx = {
    user,
    eventContext: {
      actor: user.id,
      correlationId: "findings-import-request",
    },
  };
  const logger = pino({ enabled: false });
  const vulnerabilityService = {
    listMappings: vi.fn(),
    getByID: vi.fn(),
    create: vi.fn(),
    createMapping: vi.fn(),
  };
  const findingService = {
    createOrUpdate: vi.fn(),
  };
  const resolveAsset = vi.fn();
  const vulnerability = {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const asset = {
    id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    displayName: "api.exposurenexus.local",
    type: AssetType.Host,
    ownerId: null,
    identifiers: [],
  };
  const nucleiFinding = {
    "template-id": "admin-panel",
    info: {
      name: "Exposed Admin Endpoint",
      description: "Administrative interface is reachable externally",
      remediation: "Restrict access to internal networks",
      severity: "high",
    },
    type: "http",
    host: "api.exposurenexus.local:443",
    port: "443",
    path: "/admin",
    request: "GET /admin HTTP/1.1",
    response: "HTTP/1.1 200 OK",
    "curl-command": "curl https://api.exposurenexus.local/admin",
    timestamp: "2026-01-02T03:04:05+00:00",
  };
  const finding: Finding = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    source: FindingSource.Nuclei,
    status: FindingStatus.Active,
    vulnerabilityId: vulnerability.id,
    assetId: asset.id,
    severity: vulnerability.severity,
    evidence: "evidence",
    mitigation: nucleiFinding.info.remediation,
    assigneeId: null,
    dueDate: null,
    fingerprint: "abc123",
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    vulnerability,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("creates or updates findings for mapped vulnerabilities", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    vulnerabilityService.listMappings.mockResolvedValue([
      {
        id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
        vulnerabilityId: vulnerability.id,
        source: FindingSource.Nuclei,
        matchQuery: '{"templateID":"admin-panel"}',
      },
    ] as VulnerabilitySourceMapping[]);
    vulnerabilityService.getByID.mockResolvedValue(vulnerability as Vulnerability);
    resolveAsset.mockResolvedValue(asset);
    findingService.createOrUpdate.mockResolvedValue({
      finding,
      created: true,
    });

    const result = await parser.parseNucleiFindings(
      ctx,
      Buffer.from(`${JSON.stringify(nucleiFinding)}\n`),
    );

    expect(result).toEqual([finding]);
    expect(vulnerabilityService.create).not.toHaveBeenCalled();
    expect(vulnerabilityService.createMapping).not.toHaveBeenCalled();
    expect(resolveAsset).toHaveBeenCalledWith({
      type: AssetType.Host,
      displayName: "api.exposurenexus.local",
    });
    expect(findingService.createOrUpdate).toHaveBeenCalledWith({
      user,
      finding: {
        source: FindingSource.Nuclei,
        status: FindingStatus.Active,
        vulnerabilityId: vulnerability.id,
        assetId: asset.id,
        severity: vulnerability.severity,
        evidence: expect.stringContaining("GET /admin HTTP/1.1"),
        mitigation: "Restrict access to internal networks",
        assigneeId: null,
        dueDate: null,
      },
      firstSeen: expect.any(Date),
      eventContext: ctx.eventContext,
      fingerprintOptions: {
        port: "443",
        path: "/admin",
      },
    });
  });

  it("skips findings when no managed host asset matches", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    vulnerabilityService.listMappings.mockResolvedValue([
      {
        id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
        vulnerabilityId: vulnerability.id,
        source: FindingSource.Nuclei,
        matchQuery: '{"templateID":"admin-panel"}',
      },
    ] as VulnerabilitySourceMapping[]);
    vulnerabilityService.getByID.mockResolvedValue(vulnerability as Vulnerability);
    resolveAsset.mockResolvedValue(null);

    await expect(
      parser.parseNucleiFindings(ctx, Buffer.from(`${JSON.stringify(nucleiFinding)}\n`)),
    ).resolves.toEqual([]);

    expect(resolveAsset).toHaveBeenCalledWith({
      type: AssetType.Host,
      displayName: "api.exposurenexus.local",
    });
    expect(findingService.createOrUpdate).not.toHaveBeenCalled();
  });

  it("does not create vulnerability records for unresolved assets", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    vulnerabilityService.listMappings.mockResolvedValue([]);
    vulnerabilityService.create.mockResolvedValue(vulnerability as Vulnerability);
    resolveAsset.mockResolvedValue(null);

    await expect(
      parser.parseNucleiFindings(ctx, Buffer.from(`${JSON.stringify(nucleiFinding)}\n`)),
    ).resolves.toEqual([]);

    expect(resolveAsset).toHaveBeenCalledWith({
      type: AssetType.Host,
      displayName: "api.exposurenexus.local",
    });
    expect(vulnerabilityService.create).not.toHaveBeenCalled();
    expect(vulnerabilityService.createMapping).not.toHaveBeenCalled();
    expect(findingService.createOrUpdate).not.toHaveBeenCalled();
  });

  it("skips unresolved records while importing resolvable records", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    vulnerabilityService.listMappings.mockResolvedValue([
      {
        id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
        vulnerabilityId: vulnerability.id,
        source: FindingSource.Nuclei,
        matchQuery: '{"templateID":"admin-panel"}',
      },
    ] as VulnerabilitySourceMapping[]);
    vulnerabilityService.getByID.mockResolvedValue(vulnerability as Vulnerability);
    resolveAsset.mockResolvedValueOnce(asset).mockResolvedValueOnce(null);
    findingService.createOrUpdate.mockResolvedValue({ finding, created: true });

    const result = await parser.parseNucleiFindings(
      ctx,
      Buffer.from(
        `${JSON.stringify(nucleiFinding)}\n${JSON.stringify({
          ...nucleiFinding,
          host: "unmanaged.exposurenexus.local",
        })}\n`,
      ),
    );

    expect(result).toEqual([finding]);
    expect(resolveAsset).toHaveBeenNthCalledWith(1, {
      type: AssetType.Host,
      displayName: "api.exposurenexus.local",
    });
    expect(resolveAsset).toHaveBeenNthCalledWith(2, {
      type: AssetType.Host,
      displayName: "unmanaged.exposurenexus.local",
    });
    expect(findingService.createOrUpdate).toHaveBeenCalledTimes(1);
  });

  it("creates vulnerabilities and mappings when no mapping exists", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    vulnerabilityService.listMappings.mockResolvedValue([]);
    vulnerabilityService.create.mockResolvedValue(vulnerability as Vulnerability);
    vulnerabilityService.createMapping.mockResolvedValue({
      id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
      vulnerabilityId: vulnerability.id,
      source: FindingSource.Nuclei,
      matchQuery: '{"templateID":"admin-panel"}',
    } as VulnerabilitySourceMapping);
    resolveAsset.mockResolvedValue(asset);
    findingService.createOrUpdate.mockResolvedValue({
      finding,
      created: true,
    });

    await parser.parseNucleiFindings(ctx, Buffer.from(`${JSON.stringify(nucleiFinding)}\n`));

    expect(vulnerabilityService.create).toHaveBeenCalledWith({
      user,
      eventContext: ctx.eventContext,
      vulnerability: {
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: "Administrative interface is reachable externally",
        cve: "",
        cwe: 0,
      },
    });
    expect(vulnerabilityService.createMapping).toHaveBeenCalledWith({
      vulnerabilityId: vulnerability.id,
      source: FindingSource.Nuclei,
      matchQuery: '{"templateID":"admin-panel"}',
      eventContext: ctx.eventContext,
    });
  });

  it("skips findings without a host", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    vulnerabilityService.listMappings.mockResolvedValue([]);

    const result = await parser.parseNucleiFindings(
      ctx,
      Buffer.from(
        `${JSON.stringify({
          ...nucleiFinding,
          host: undefined,
        })}\n`,
      ),
    );

    expect(result).toEqual([]);
    expect(resolveAsset).not.toHaveBeenCalled();
    expect(findingService.createOrUpdate).not.toHaveBeenCalled();
  });

  it("skips findings when a new vulnerability cannot be named", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    vulnerabilityService.listMappings.mockResolvedValue([]);

    const result = await parser.parseNucleiFindings(
      ctx,
      Buffer.from(
        `${JSON.stringify({
          ...nucleiFinding,
          info: {
            ...nucleiFinding.info,
            name: undefined,
          },
        })}\n`,
      ),
    );

    expect(result).toEqual([]);
    expect(vulnerabilityService.create).not.toHaveBeenCalled();
  });

  it("throws a 400 HTTP exception when a line cannot be parsed", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    await expect(
      parser.parseNucleiFindings(ctx, Buffer.from("{not-json}\n")),
    ).rejects.toMatchObject({
      status: 400,
      message: "failed to parse line 1",
    } satisfies Partial<ApiError>);
  });

  it("returns empty evidence when the request body is missing", async () => {
    const parser = createNucleiFindingParser({
      vulnerabilityService,
      findingService,
      resolveAsset,
      logger,
    });

    vulnerabilityService.listMappings.mockResolvedValue([
      {
        id: "3dcd2647-d0e4-4281-a9cb-5b4eb5955c47",
        vulnerabilityId: vulnerability.id,
        source: FindingSource.Nuclei,
        matchQuery: '{"templateID":"admin-panel"}',
      },
    ] as VulnerabilitySourceMapping[]);
    vulnerabilityService.getByID.mockResolvedValue(vulnerability as Vulnerability);
    resolveAsset.mockResolvedValue(asset);
    findingService.createOrUpdate.mockResolvedValue({
      finding,
      created: true,
    });

    await parser.parseNucleiFindings(
      ctx,
      Buffer.from(
        `${JSON.stringify({
          ...nucleiFinding,
          request: undefined,
          response: undefined,
          "curl-command": undefined,
        })}\n`,
      ),
    );

    expect(findingService.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        finding: expect.objectContaining({
          evidence: "",
          assigneeId: null,
          dueDate: null,
        }),
        fingerprintOptions: {
          port: "443",
          path: "/admin",
        },
      }),
    );
  });
});
