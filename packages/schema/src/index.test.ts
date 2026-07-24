import { describe, expect, it } from "vitest";
import { ExplorerDataSchema, parseExplorerData } from "./index.js";

describe("ExplorerDataSchema", () => {
  it("accepts a minimal valid payload", () => {
    const data = {
      generatedAt: "2026-07-24T00:00:00.000Z",
      meta: {
        org: "abraxas-labs",
        pipelineVersion: "0.1.0",
        triggers: ["fixtures"],
        vulnScan: {
          enabled: true,
          scanner: "osv",
          mode: "direct",
          coverageNote: "direct",
          scannedAt: "2026-07-24T00:00:00.000Z",
        },
        coverage: { repos: 1, classified: 1, unclassified: 0 },
      },
      glossary: [{ term: "Ausmittlung", gloss: "Vote counting" }],
      products: [{ id: "voting", name: "VOTING", domains: ["ausmittlung"] }],
      domains: [
        {
          id: "ausmittlung",
          product: "voting",
          title: "Ausmittlung",
          purpose: "Vote counting",
          securityCritical: true,
          repos: ["voting-ausmittlung-service"],
          coverage: {
            hasProto: true,
            hasDocs: true,
            hasChangelog: true,
            confidence: "high",
          },
        },
      ],
      repos: [
        {
          name: "voting-ausmittlung-service",
          product: "voting",
          domain: "ausmittlung",
          type: "service",
          language: "C#",
          description: "Backend",
          lastPush: "2026-06-19",
          stars: 3,
          forks: 2,
          url: "https://github.com/abraxas-labs/voting-ausmittlung-service",
          docsUrl: null,
          changelogUrl: null,
          version: "1.0.0",
          security: { critical: true, notes: [] },
          topics: [],
        },
      ],
      projectLinks: [],
      packages: [],
      vulnerabilities: [],
      deepDives: {
        ausmittlung: {
          provenance: "auto",
          apps: [],
          stack: { backend: [], frontend: [], contracts: [] },
          apiSurface: { source: "unavailable", services: [], unresolvedImports: [] },
          dataModel: { source: "unavailable", groups: [] },
          flow: {
            kind: "heuristic",
            disclaimer: "heuristic",
            mermaid: "sequenceDiagram\n  A->>B: hi",
          },
          securityNotes: [],
          docs: [],
        },
      },
    };

    expect(() => parseExplorerData(data)).not.toThrow();
    expect(ExplorerDataSchema.safeParse(data).success).toBe(true);
  });

  it("rejects fabricated vulnerability ids without CVE/GHSA/OSV prefix", () => {
    const bad = {
      generatedAt: "2026-07-24T00:00:00.000Z",
      meta: {
        org: "abraxas-labs",
        pipelineVersion: "0.1.0",
        triggers: [],
        vulnScan: { enabled: false },
        coverage: { repos: 0, classified: 0, unclassified: 0 },
      },
      glossary: [],
      products: [],
      domains: [],
      repos: [],
      projectLinks: [],
      packages: [],
      vulnerabilities: [
        {
          id: "FAKE-1",
          aliases: [],
          package: {
            ecosystem: "npm",
            name: "x",
            installedVersion: "1.0.0",
          },
          repos: [],
          severity: "LOW",
          cvssScore: null,
          summary: "nope",
          fixedIn: [],
          references: [],
          source: "fabricated",
        },
      ],
      deepDives: {},
    };
    expect(ExplorerDataSchema.safeParse(bad).success).toBe(false);
  });
});
