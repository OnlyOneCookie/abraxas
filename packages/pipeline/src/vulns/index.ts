import type { CvssMetric, PackageEntry, Vulnerability } from "@abraxas/schema";
import aeCvss from "ae-cvss-calculator";

const { Cvss3P0, Cvss3P1, Cvss4P0 } = aeCvss;

export interface ScanTarget {
  ecosystem: "npm" | "nuget";
  name: string;
  version: string;
  repo: string;
}

export interface VulnFinding {
  id: string;
  aliases: string[];
  ecosystem: "npm" | "nuget";
  packageName: string;
  installedVersion: string;
  severity: Vulnerability["severity"];
  cvssScore: number | null;
  cvssV3: CvssMetric | null;
  cvssV4: CvssMetric | null;
  summary: string;
  fixedIn: string[];
  references: string[];
  source: string;
  repos: string[];
}

export interface VulnScanner {
  readonly name: string;
  scan(targets: ScanTarget[]): Promise<VulnFinding[]>;
}

export class NoopAdapter implements VulnScanner {
  readonly name = "noop";
  async scan(): Promise<VulnFinding[]> {
    return [];
  }
}

/** Map OSV / GHSA severity strings into our enum. */
export function normalizeSeverity(
  raw: string | undefined,
  score: number | null,
): Vulnerability["severity"] {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("CRIT")) return "CRITICAL";
  if (s.includes("HIGH")) return "HIGH";
  if (s.includes("MED")) return "MEDIUM";
  if (s.includes("LOW")) return "LOW";
  if (score != null) {
    if (score >= 9) return "CRITICAL";
    if (score >= 7) return "HIGH";
    if (score >= 4) return "MEDIUM";
    if (score > 0) return "LOW";
  }
  return "UNKNOWN";
}

export function scoreCvssVector(vector: string): number | null {
  const v = vector.trim();
  try {
    if (v.startsWith("CVSS:4")) {
      const scores = new Cvss4P0(v).calculateScores();
      return round1(scores.base ?? scores.overall);
    }
    if (v.startsWith("CVSS:3.1")) {
      const scores = new Cvss3P1(v).calculateScores();
      return round1(scores.base ?? scores.overall);
    }
    if (v.startsWith("CVSS:3.0") || v.startsWith("CVSS:3/")) {
      const scores = new Cvss3P0(v).calculateScores();
      return round1(scores.base ?? scores.overall);
    }
    if (v.startsWith("CVSS:3")) {
      const scores = new Cvss3P1(v).calculateScores();
      return round1(scores.base ?? scores.overall);
    }
  } catch {
    return null;
  }
  return null;
}

function round1(n: number | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function metricVersionFromVector(vector: string, fallback: string): string {
  const m = /^CVSS:(\d+(?:\.\d+)?)/i.exec(vector.trim());
  return m?.[1] ?? fallback;
}

/**
 * Extract CVSS v3 and v4 metrics from OSV `severity[]`.
 * OSV stores vectors (not numeric scores); we compute official base scores.
 */
export function parseOsvCvssMetrics(
  severity: Array<{ type?: string; score?: string }> | undefined,
): { cvssV3: CvssMetric | null; cvssV4: CvssMetric | null } {
  let cvssV3: CvssMetric | null = null;
  let cvssV4: CvssMetric | null = null;
  if (!severity?.length) return { cvssV3, cvssV4 };

  for (const entry of severity) {
    const raw = entry.score?.trim();
    if (!raw) continue;
    const type = (entry.type ?? "").toUpperCase();

    if (type.includes("CVSS_V4") || raw.startsWith("CVSS:4")) {
      const vector = raw.startsWith("CVSS:")
        ? raw
        : null;
      if (vector) {
        cvssV4 = {
          version: metricVersionFromVector(vector, "4.0"),
          score: scoreCvssVector(vector),
          vector,
        };
      } else if (/^\d+(\.\d+)?$/.test(raw)) {
        cvssV4 = {
          version: "4.0",
          score: Number.parseFloat(raw),
          vector: "",
        };
      }
      continue;
    }

    if (type.includes("CVSS_V3") || raw.startsWith("CVSS:3")) {
      const vector = raw.startsWith("CVSS:") ? raw : null;
      if (vector) {
        cvssV3 = {
          version: metricVersionFromVector(vector, "3.1"),
          score: scoreCvssVector(vector),
          vector,
        };
      } else if (/^\d+(\.\d+)?$/.test(raw)) {
        cvssV3 = {
          version: "3.1",
          score: Number.parseFloat(raw),
          vector: "",
        };
      }
    }
  }

  return { cvssV3, cvssV4 };
}

export function severityFromOsvVuln(vuln: OsvVuln): {
  severity: Vulnerability["severity"];
  cvssScore: number | null;
  cvssV3: CvssMetric | null;
  cvssV4: CvssMetric | null;
} {
  const { cvssV3, cvssV4 } = parseOsvCvssMetrics(vuln.severity);
  const cvssScore = cvssV4?.score ?? cvssV3?.score ?? null;
  const label = vuln.database_specific?.severity;
  return {
    severity: normalizeSeverity(label, cvssScore),
    cvssScore,
    cvssV3,
    cvssV4,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

/**
 * Batch query only gives `{id, modified}` — hydrate each id for severity/CVSS/etc.
 * Don't invent advisory ids.
 */
export class OsvApiAdapter implements VulnScanner {
  readonly name = "osv";
  constructor(
    private readonly batchEndpoint = "https://api.osv.dev/v1/querybatch",
    private readonly vulnEndpoint = "https://api.osv.dev/v1/vulns",
  ) {}

  async scan(targets: ScanTarget[]): Promise<VulnFinding[]> {
    if (!targets.length) return [];

    const key = (t: ScanTarget) => `${t.ecosystem}|${t.name}|${t.version}`;
    const groups = new Map<string, ScanTarget[]>();
    for (const t of targets) {
      const k = key(t);
      const list = groups.get(k) ?? [];
      list.push(t);
      groups.set(k, list);
    }

    const unique = [...groups.values()].map((g) => g[0]!);
    const queries = unique.map((t) => ({
      package: {
        name: t.name,
        ecosystem: t.ecosystem === "npm" ? "npm" : "NuGet",
      },
      version: t.version,
    }));

    const idToHits = new Map<
      string,
      Array<{ target: ScanTarget; repos: string[] }>
    >();

    const chunkSize = 100;
    for (let i = 0; i < queries.length; i += chunkSize) {
      const chunk = queries.slice(i, i + chunkSize);
      const chunkTargets = unique.slice(i, i + chunkSize);
      let body: { results?: Array<{ vulns?: Array<{ id?: string }> }> };
      try {
        const res = await fetch(this.batchEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: chunk }),
        });
        if (!res.ok) {
          throw new Error(`OSV querybatch failed: ${res.status}`);
        }
        body = (await res.json()) as typeof body;
      } catch (err) {
        console.warn("[vulns] OSV request failed:", err);
        continue;
      }

      const results = body.results ?? [];
      for (let qi = 0; qi < results.length; qi++) {
        const t = chunkTargets[qi]!;
        const group = groups.get(key(t)) ?? [t];
        const repos = [...new Set(group.map((g) => g.repo))];
        for (const stub of results[qi]?.vulns ?? []) {
          const id = stub.id;
          if (!id || !/^(CVE|GHSA|OSV)-/i.test(id)) continue;
          const hits = idToHits.get(id) ?? [];
          hits.push({ target: t, repos });
          idToHits.set(id, hits);
        }
      }
    }

    const ids = [...idToHits.keys()];
    console.log(`[vulns] hydrating ${ids.length} OSV records`);
    const hydrated = await mapPool(ids, 8, async (id) => {
      try {
        const res = await fetch(
          `${this.vulnEndpoint}/${encodeURIComponent(id)}`,
        );
        if (!res.ok) return { id, vuln: null as OsvVuln | null };
        const vuln = (await res.json()) as OsvVuln;
        return { id, vuln };
      } catch {
        return { id, vuln: null as OsvVuln | null };
      }
    });

    const byId = new Map(
      hydrated.filter((h) => h.vuln).map((h) => [h.id, h.vuln!] as const),
    );

    const findings: VulnFinding[] = [];
    for (const [id, hits] of idToHits) {
      const vuln = byId.get(id);
      if (!vuln) {
        for (const hit of hits) {
          findings.push({
            id,
            aliases: [],
            ecosystem: hit.target.ecosystem,
            packageName: hit.target.name,
            installedVersion: hit.target.version,
            severity: "UNKNOWN",
            cvssScore: null,
            cvssV3: null,
            cvssV4: null,
            summary: "",
            fixedIn: [],
            references: [`https://osv.dev/vulnerability/${id}`],
            source: "osv-api",
            repos: hit.repos,
          });
        }
        continue;
      }

      const { severity, cvssScore, cvssV3, cvssV4 } = severityFromOsvVuln(vuln);
      for (const hit of hits) {
        findings.push({
          id: vuln.id,
          aliases: vuln.aliases ?? [],
          ecosystem: hit.target.ecosystem,
          packageName: hit.target.name,
          installedVersion: hit.target.version,
          severity,
          cvssScore,
          cvssV3,
          cvssV4,
          summary: vuln.summary ?? vuln.details?.slice(0, 280) ?? "",
          fixedIn: extractFixedIn(vuln),
          references: (vuln.references ?? [])
            .map((r) => r.url)
            .filter(Boolean),
          source: "osv-api",
          repos: hit.repos,
        });
      }
    }
    return findings;
  }
}

export interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: { severity?: string };
  references?: Array<{ url: string }>;
  affected?: Array<{
    ranges?: Array<{ events?: Array<{ fixed?: string }> }>;
  }>;
}

function extractFixedIn(vuln: OsvVuln): string[] {
  const fixed: string[] = [];
  for (const a of vuln.affected ?? []) {
    for (const r of a.ranges ?? []) {
      for (const e of r.events ?? []) {
        if (e.fixed) fixed.push(e.fixed);
      }
    }
  }
  return [...new Set(fixed)];
}

/** Placeholders if I ever swap scanners — OSV is what I actually use. */
export class GithubAdvisoryAdapter implements VulnScanner {
  readonly name = "github";
  async scan(): Promise<VulnFinding[]> {
    throw new Error("GithubAdvisoryAdapter not wired up — use osv");
  }
}

export class TrivyAdapter implements VulnScanner {
  readonly name = "trivy";
  async scan(): Promise<VulnFinding[]> {
    throw new Error("TrivyAdapter not wired up");
  }
}

export class GrypeAdapter implements VulnScanner {
  readonly name = "grype";
  async scan(): Promise<VulnFinding[]> {
    throw new Error("GrypeAdapter not wired up");
  }
}

export function createScanner(name: string | undefined): VulnScanner {
  switch ((name ?? "osv").toLowerCase()) {
    case "noop":
      return new NoopAdapter();
    case "github":
      return new GithubAdvisoryAdapter();
    case "trivy":
      return new TrivyAdapter();
    case "grype":
      return new GrypeAdapter();
    case "osv":
    default:
      return new OsvApiAdapter();
  }
}

export function packagesToScanTargets(packages: PackageEntry[]): ScanTarget[] {
  return packages
    .filter((p) => p.osvEligible && p.declaredVersion)
    .map((p) => ({
      ecosystem: p.ecosystem,
      name: p.name,
      version: p.declaredVersion!,
      repo: p.repo,
    }));
}

export function findingsToVulnerabilities(
  findings: VulnFinding[],
): Vulnerability[] {
  return findings.map((f) => ({
    id: f.id,
    aliases: f.aliases,
    package: {
      ecosystem: f.ecosystem,
      name: f.packageName,
      installedVersion: f.installedVersion,
    },
    repos: f.repos,
    severity: f.severity,
    cvssScore: f.cvssScore,
    cvssV3: f.cvssV3,
    cvssV4: f.cvssV4,
    summary: f.summary,
    fixedIn: f.fixedIn,
    references: f.references,
    source: f.source,
  }));
}

export interface VulnScanConfig {
  enabled: boolean;
  scanner: string;
  mode: "direct" | "transitive";
  required: boolean;
  hasRegistrySecrets: boolean;
}

export function readVulnScanConfig(
  env: NodeJS.ProcessEnv = process.env,
): VulnScanConfig {
  const enabled = (env.VULN_SCAN_ENABLED ?? "true").toLowerCase() !== "false";
  let mode = (env.VULN_SCAN_MODE ?? "direct").toLowerCase() as
    | "direct"
    | "transitive";
  const hasRegistrySecrets = Boolean(
    env.ABRAXAS_NPM_TOKEN || env.ABRAXAS_NUGET_TOKEN,
  );
  if (mode === "transitive" && !hasRegistrySecrets) {
    console.warn(
      "[vulns] VULN_SCAN_MODE=transitive but registry secrets missing; falling back to direct",
    );
    mode = "direct";
  }
  return {
    enabled,
    scanner: env.VULN_SCANNER ?? "osv",
    mode,
    required: (env.VULN_SCAN_REQUIRED ?? "false").toLowerCase() === "true",
    hasRegistrySecrets,
  };
}
