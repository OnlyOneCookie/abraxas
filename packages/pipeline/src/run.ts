import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Domain,
  ExplorerData,
  PackageEntry,
  Product,
  Repo,
} from "@abraxas/schema";
import { classifyRepo, domainMeta } from "./classify/index.js";
import { collectOrg, type ClonedRepo } from "./collect/index.js";
import { buildDeepDive } from "./deepdive/index.js";
import { findChangelogVersion } from "./docsindex/index.js";
import { emitDataJson } from "./emit/index.js";
import { DEFAULT_GLOSSARY } from "./glossary.js";
import { buildProjectLinks } from "./links/index.js";
import { inventoryPackages } from "./packages/index.js";
import {
  createScanner,
  findingsToVulnerabilities,
  packagesToScanTargets,
  readVulnScanConfig,
} from "./vulns/index.js";
import { checkOrgChanges, loadExistingData } from "./changes/index.js";
import { writeUpdateStatus } from "./status.js";

const PIPELINE_VERSION = "0.1.0";
const ORG = "abraxas-labs";

export interface RunOptions {
  fixtures?: boolean;
  workspaceDir?: string;
  outPath?: string;
  triggers?: string[];
  skipVulnScan?: boolean;
  /** Skip clone+emit when org pushedAt fingerprint matches existing data.json */
  skipIfUnchanged?: boolean;
  /** Force full refresh even when unchanged */
  force?: boolean;
  org?: string;
}

function repoRootFromImport(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // packages/pipeline/src -> repo root
  return path.resolve(here, "../../..");
}

function securityNotesForRepo(name: string, classifiedCritical: boolean): string[] {
  const notes: string[] = [];
  if (!classifiedCritical) return notes;
  if (name.includes("ausmittlung")) {
    notes.push("Result integrity", "Event signatures (PKCS#11/HSM)");
  }
  if (name.includes("stimmregister")) notes.push("Voter register accuracy");
  if (name.includes("evoting")) notes.push("E-voting integration surface");
  if (name.includes("eservice") || name.includes("citizen")) {
    notes.push("Citizen-facing endpoint");
  }
  if (name.includes("ecollecting")) notes.push("Signature collection integrity");
  if (name.includes("proto")) notes.push("Contract = validation/trust boundary");
  if (name.includes("validation-proto")) {
    notes.push("Shared input-validation contracts");
  }
  return notes;
}

function loadFixtureRepos(fixturesRoot: string): ClonedRepo[] {
  const names = fs
    .readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  return names.map((name) => {
    const root = path.join(fixturesRoot, name);
    const metaPath = path.join(root, "_meta.json");
    const meta = fs.existsSync(metaPath)
      ? (JSON.parse(fs.readFileSync(metaPath, "utf8")) as ClonedRepo["meta"])
      : {
          name,
          description: `Fixture ${name}`,
          language: null,
          pushedAt: "2026-07-01T00:00:00Z",
          stargazerCount: 0,
          forkCount: 0,
          url: `https://github.com/${ORG}/${name}`,
          isArchived: false,
        };
    return {
      name,
      root,
      meta: { ...meta, name },
      health: {
        clone: "ok" as const,
        submodules: fs.existsSync(path.join(root, ".gitmodules"))
          ? ("partial" as const)
          : ("none" as const),
      },
    };
  });
}

export async function runPipeline(options: RunOptions = {}): Promise<ExplorerData> {
  const root = repoRootFromImport();
  const outPath =
    options.outPath ?? path.join(root, "data", "data.json");
  const triggers = options.triggers ?? ["manual"];
  const org = options.org ?? ORG;
  const skipIfUnchanged = options.skipIfUnchanged !== false;
  const force = options.force === true;
  const isSchedule = triggers.includes("schedule");

  let cloned: ClonedRepo[];
  if (options.fixtures) {
    const fixturesRoot = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../fixtures",
    );
    cloned = loadFixtureRepos(fixturesRoot);
    console.log(`[pipeline] loaded ${cloned.length} fixture repos`);
  } else {
    // Cheap change detection before any clones
    if (skipIfUnchanged && !force) {
      try {
        const check = await checkOrgChanges({ org, outPath });
        if (check.unchanged) {
          const existing = loadExistingData(outPath);
          if (existing) {
            // Nightly still re-queries OSV for newly disclosed CVEs on known packages
            if (isSchedule && !options.skipVulnScan) {
              console.log(
                `[pipeline] no repo changes (${check.remoteCount} repos) — re-scanning vulns only`,
              );
              const vulnConfig = readVulnScanConfig();
              let vulnerabilities = existing.vulnerabilities;
              let vulnMeta = existing.meta.vulnScan;
              if (vulnConfig.enabled) {
                try {
                  const scanner = createScanner(vulnConfig.scanner);
                  const findings = await scanner.scan(
                    packagesToScanTargets(existing.packages),
                  );
                  vulnerabilities = findingsToVulnerabilities(findings);
                  vulnMeta = {
                    enabled: true,
                    scanner: scanner.name as "osv",
                    mode: vulnConfig.mode,
                    coverageNote:
                      "Direct public third-party deps (NuGet props resolved when possible). No transitive scan — that needs their private registry.",
                    scannedAt: new Date().toISOString(),
                  };
                } catch (err) {
                  console.warn("[vulns] scan failed:", err);
                }
              }
              const updated: ExplorerData = {
                ...existing,
                generatedAt: new Date().toISOString(),
                meta: {
                  ...existing.meta,
                  triggers: [...triggers, "vuln-only"],
                  vulnScan: vulnMeta,
                },
                vulnerabilities,
              };
              const emitted = emitDataJson(updated, outPath);
              writeUpdateStatus(root, {
                phase: "success",
                message: `No repo changes — vulnerability data refreshed (${check.remoteCount} repos)`,
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                generatedAt: emitted.generatedAt,
                error: null,
                pid: null,
                skipped: false,
              });
              return emitted;
            }

            console.log(
              `[pipeline] no repo changes since last data.json (${check.remoteCount} repos) — skip`,
            );
            writeUpdateStatus(root, {
              phase: "skipped",
              message: `No changes in abraxas-labs — skipped (${check.remoteCount} repos)`,
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              generatedAt: existing.generatedAt,
              error: null,
              pid: null,
              skipped: true,
            });
            return existing;
          }
        } else {
          console.log(
            `[pipeline] org changes detected (was ${check.previousCount}, now ${check.remoteCount}) — full refresh`,
          );
        }
      } catch (err) {
        console.warn(
          "[pipeline] change check failed, continuing with full collect:",
          err,
        );
      }
    }

    const workspaceDir =
      options.workspaceDir ?? path.join(root, "workspace", "repos");
    fs.mkdirSync(workspaceDir, { recursive: true });
    cloned = await collectOrg({
      org,
      workspaceDir,
      recurseSubmodules: true,
    });
  }

  const repos: Repo[] = [];
  const repoRoots = new Map<string, string>();
  const allPackages: PackageEntry[] = [];

  for (const c of cloned) {
    if (c.health.clone === "failed") {
      const classification = classifyRepo(c.name);
      repos.push({
        name: c.name,
        product: classification.product,
        domain: classification.domain,
        type: classification.type,
        language: c.meta.language ?? "Other",
        description: c.meta.description ?? "",
        lastPush: c.meta.pushedAt,
        stars: c.meta.stargazerCount,
        forks: c.meta.forkCount,
        url: c.meta.url,
        docsUrl: null,
        changelogUrl: `https://github.com/${org}/${c.name}/blob/main/CHANGELOG.md`,
        version: null,
        security: {
          critical: classification.securityCritical,
          notes: securityNotesForRepo(c.name, classification.securityCritical),
        },
        health: {
          clone: "failed",
          submodules: "none",
          restore: "skipped",
          error: c.health.error,
        },
        topics: [],
      });
      continue;
    }

    repoRoots.set(c.name, c.root);
    const classification = classifyRepo(c.name);
    const inv = inventoryPackages(c.name, c.root);
    allPackages.push(...inv.packages);

    const version =
      findChangelogVersion(c.root) ??
      c.meta.latestRelease?.tagName?.replace(/^v/, "") ??
      null;

    const docsSibling = cloned.find(
      (x) =>
        classifyRepo(x.name).domain === classification.domain &&
        classifyRepo(x.name).type === "docs",
    );

    repos.push({
      name: c.name,
      product: classification.product,
      domain: classification.domain,
      type: classification.type,
      language: c.meta.language ?? "Other",
      description: c.meta.description ?? "",
      lastPush: c.meta.pushedAt,
      stars: c.meta.stargazerCount,
      forks: c.meta.forkCount,
      url: c.meta.url,
      docsUrl: docsSibling
        ? `https://github.com/${org}/${docsSibling.name}`
        : null,
      changelogUrl: `https://github.com/${org}/${c.name}/blob/main/CHANGELOG.md`,
      version,
      security: {
        critical: classification.securityCritical,
        notes: securityNotesForRepo(c.name, classification.securityCritical),
      },
      health: {
        clone: "ok",
        submodules: c.health.submodules,
        restore: "skipped",
        error: c.health.error,
      },
      nugetAudit: inv.nugetAudit,
      topics:
        c.meta.repositoryTopics?.nodes
          ?.map((n) => n.topic?.name)
          .filter((x): x is string => Boolean(x)) ?? [],
    });
  }

  // External design-system node for graph completeness
  const hasBaseComponents = allPackages.some(
    (p) => p.name === "@abraxas/base-components",
  );
  if (hasBaseComponents) {
    repos.push({
      name: "@abraxas/base-components",
      product: "voting",
      domain: "shared",
      type: "external",
      language: "—",
      description:
        "Abraxas design-system components consumed by the Angular web apps.",
      lastPush: null,
      stars: null,
      forks: null,
      url: `https://github.com/${org}`,
      docsUrl: null,
      changelogUrl: null,
      version: null,
      security: { critical: false, notes: [] },
      topics: [],
    });
  }

  const projectLinks = buildProjectLinks(
    [...repoRoots.entries()].map(([name, root]) => {
      const r = repos.find((x) => x.name === name)!;
      return { name, domain: r.domain, type: r.type, root };
    }),
  );

  const domainIds = [...new Set(repos.map((r) => r.domain))];
  const domains: Domain[] = domainIds.map((id) => {
    const meta = domainMeta(id);
    const domainRepos = repos.filter((r) => r.domain === id && r.type !== "external");
    const hasProto = domainRepos.some((r) => r.type === "proto");
    const hasDocs = domainRepos.some((r) => r.type === "docs");
    const hasChangelog = domainRepos.some((r) => Boolean(r.version));
    let confidence: Domain["coverage"]["confidence"] = "low";
    if (hasProto && hasDocs) confidence = "high";
    else if (hasProto || hasDocs) confidence = "medium";
    return {
      id,
      product: meta.product,
      title: meta.title,
      purpose: meta.purpose,
      securityCritical: meta.securityCritical,
      repos: domainRepos.map((r) => r.name),
      coverage: { hasProto, hasDocs, hasChangelog, confidence },
    };
  });

  const productMap = new Map<string, Product>();
  for (const d of domains) {
    const existing = productMap.get(d.product);
    if (existing) {
      if (!existing.domains.includes(d.id)) existing.domains.push(d.id);
    } else {
      const name =
        d.product === "voting"
          ? "VOTING"
          : d.product === "per"
            ? "PER"
            : d.product === "infra"
              ? "Infra"
              : "Other";
      productMap.set(d.product, {
        id: d.product,
        name,
        domains: [d.id],
      });
    }
  }

  const deepDives: ExplorerData["deepDives"] = {};
  for (const d of domains) {
    if (d.id === "unclassified" || d.id === "infra") continue;
    deepDives[d.id] = buildDeepDive({
      domainId: d.id,
      domainTitle: d.title,
      repos: repos.filter((r) => r.domain === d.id),
      repoRoots,
      packages: allPackages,
      projectLinks,
    });
  }

  const vulnConfig = readVulnScanConfig();
  let vulnerabilities: ExplorerData["vulnerabilities"] = [];
  let vulnMeta: ExplorerData["meta"]["vulnScan"] = {
    enabled: false,
    reason: "skipped",
  };

  if (options.skipVulnScan || !vulnConfig.enabled) {
    vulnMeta = {
      enabled: false,
      scanner: vulnConfig.scanner as "osv",
      mode: vulnConfig.mode,
      reason: options.skipVulnScan ? "skipVulnScan flag" : "VULN_SCAN_ENABLED=false",
    };
  } else {
    try {
      const scanner = createScanner(vulnConfig.scanner);
      const targets = packagesToScanTargets(allPackages);
      console.log(
        `[vulns] mode=${vulnConfig.mode} scanner=${scanner.name} targets=${targets.length}`,
      );
      const findings = await scanner.scan(targets);
      vulnerabilities = findingsToVulnerabilities(findings);
      vulnMeta = {
        enabled: true,
        scanner: scanner.name as "osv",
        mode: vulnConfig.mode,
        coverageNote:
          "Direct public third-party deps (NuGet props resolved when possible). No transitive scan — that needs their private registry.",
        scannedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn("[vulns] scan failed:", err);
      if (vulnConfig.required) throw err;
      vulnMeta = {
        enabled: false,
        scanner: vulnConfig.scanner as "osv",
        mode: vulnConfig.mode,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const nonExternal = repos.filter((r) => r.type !== "external");
  const classified = nonExternal.filter((r) => r.type !== "unclassified").length;
  const unclassified = nonExternal.filter((r) => r.type === "unclassified").length;

  const data: ExplorerData = {
    generatedAt: new Date().toISOString(),
    meta: {
      org,
      pipelineVersion: PIPELINE_VERSION,
      triggers,
      vulnScan: vulnMeta,
      coverage: {
        repos: nonExternal.length,
        classified,
        unclassified,
      },
    },
    glossary: DEFAULT_GLOSSARY,
    products: [...productMap.values()],
    domains,
    repos,
    projectLinks,
    packages: allPackages,
    vulnerabilities,
    deepDives,
  };

  const emitted = emitDataJson(data, outPath);
  writeUpdateStatus(root, {
    phase: "success",
    message: `Org data refreshed — ${nonExternal.length} public repos`,
    startedAt: null,
    finishedAt: new Date().toISOString(),
    generatedAt: emitted.generatedAt,
    error: null,
    pid: null,
    skipped: false,
  });
  return emitted;
}
