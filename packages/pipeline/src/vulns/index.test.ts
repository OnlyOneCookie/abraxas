import { describe, expect, it } from "vitest";
import {
  NoopAdapter,
  normalizeSeverity,
  packagesToScanTargets,
  parseOsvCvssMetrics,
  readVulnScanConfig,
  scoreCvssVector,
  severityFromOsvVuln,
} from "./index.js";
import type { PackageEntry } from "@abraxas/schema";

describe("vulns", () => {
  it("normalizes severities", () => {
    expect(normalizeSeverity("CRITICAL", null)).toBe("CRITICAL");
    expect(normalizeSeverity(undefined, 7.5)).toBe("HIGH");
  });

  it("parses OSV CVSS_V3 and CVSS_V4 vectors into scored metrics", () => {
    const { cvssV3, cvssV4 } = parseOsvCvssMetrics([
      {
        type: "CVSS_V3",
        score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
      },
      {
        type: "CVSS_V4",
        score:
          "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N",
      },
    ]);
    expect(cvssV3?.version).toBe("3.1");
    expect(cvssV3?.score).toBe(6.1);
    expect(cvssV4?.version).toBe("4.0");
    expect(cvssV4?.score).toBe(8.8);
  });

  it("prefers v4 score for overall cvssScore", () => {
    const { severity, cvssScore, cvssV3, cvssV4 } = severityFromOsvVuln({
      id: "GHSA-39pv-4j6c-2g6v",
      severity: [
        {
          type: "CVSS_V3",
          score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N",
        },
        {
          type: "CVSS_V4",
          score:
            "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N/SC:N/SI:N/SA:N",
        },
      ],
      database_specific: { severity: "HIGH" },
    });
    expect(severity).toBe("HIGH");
    expect(cvssScore).toBe(8.8);
    expect(cvssV3?.score).toBe(6.1);
    expect(cvssV4?.score).toBe(8.8);
  });

  it("scores classic CVSS 3.1 critical vector", () => {
    expect(
      scoreCvssVector(
        "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      ),
    ).toBe(9.8);
  });

  it("filters to osv-eligible packages only", () => {
    const pkgs: PackageEntry[] = [
      {
        repo: "r",
        ecosystem: "npm",
        name: "@angular/core",
        declaredVersion: "21.2.8",
        installedVersion: null,
        direct: true,
        transitive: false,
        scope: "third-party",
        osvEligible: true,
        versionSource: "package.json",
        dev: false,
      },
      {
        repo: "r",
        ecosystem: "npm",
        name: "@abraxas/voting-lib",
        declaredVersion: "5.0.0",
        installedVersion: null,
        direct: true,
        transitive: false,
        scope: "first-party",
        osvEligible: false,
        versionSource: "package.json",
        dev: false,
      },
    ];
    expect(packagesToScanTargets(pkgs)).toHaveLength(1);
  });

  it("noop adapter returns empty", async () => {
    expect(await new NoopAdapter().scan([])).toEqual([]);
  });

  it("falls back to direct without registry secrets", () => {
    const cfg = readVulnScanConfig({
      VULN_SCAN_MODE: "transitive",
      VULN_SCAN_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(cfg.mode).toBe("direct");
  });
});
