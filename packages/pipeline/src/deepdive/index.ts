import fs from "node:fs";
import path from "node:path";
import type { DeepDive, PackageEntry, ProjectLink, Repo } from "@abraxas/schema";
import { parseProtos } from "../proto/index.js";
import { indexDocsRepo } from "../docsindex/index.js";

const FLOW_DISCLAIMER =
  "Guessed from project links + whatever security signals I found — not an official sequence diagram from Abraxas.";

export function buildDeepDive(opts: {
  domainId: string;
  domainTitle: string;
  repos: Repo[];
  repoRoots: Map<string, string>;
  packages: PackageEntry[];
  projectLinks: ProjectLink[];
}): DeepDive {
  const { domainId, domainTitle, repos, repoRoots, packages, projectLinks } =
    opts;

  const protoRepo = repos.find((r) => r.type === "proto");
  const docsRepo = repos.find((r) => r.type === "docs");
  const serviceRepo = repos.find((r) => r.type === "service");
  const webappRepo = repos.find((r) => r.type === "webapp");

  let apiSurface: DeepDive["apiSurface"] = {
    source: "unavailable",
    services: [],
    unresolvedImports: [],
  };
  let dataModel: DeepDive["dataModel"] = {
    source: "unavailable",
    groups: [],
  };

  if (protoRepo && repoRoots.has(protoRepo.name)) {
    const parsed = parseProtos(repoRoots.get(protoRepo.name)!);
    apiSurface = parsed.apiSurface;
    dataModel = parsed.dataModel;
  }

  const docs =
    docsRepo && repoRoots.has(docsRepo.name)
      ? indexDocsRepo(docsRepo.name, repoRoots.get(docsRepo.name)!)
      : [];

  const domainPackages = packages.filter((p) =>
    repos.some((r) => r.name === p.repo),
  );
  const securityNotes = collectSecurityNotes({
    repos,
    packages: domainPackages,
    repoRoots,
  });

  const apps = detectApps(webappRepo, repoRoots);
  const stack = detectStack(domainPackages, repos);
  const mermaid = buildHeuristicMermaid({
    domainTitle,
    hasWebapp: Boolean(webappRepo),
    hasService: Boolean(serviceRepo),
    hasHsm: securityNotes.some((n) => /HSM|PKCS/i.test(n.text)),
    hasOtp: securityNotes.some((n) => /OTP|2FA|MFA/i.test(n.text)),
    linksBasis: projectLinks.some(
      (l) =>
        l.sourceRepo.includes(domainId === "su-online" ? "stimmunterlagen" : domainId) &&
        l.targetRepo.includes("basis") &&
        l.kind === "domain",
    ),
    linksStimmregister: projectLinks.some(
      (l) =>
        l.targetRepo.includes("stimmregister") && l.kind === "domain",
    ),
  });

  return {
    provenance: "auto",
    apps,
    stack,
    apiSurface,
    dataModel,
    flow: {
      kind: "heuristic",
      disclaimer: FLOW_DISCLAIMER,
      mermaid,
      svgPath: `/generated/flows/${domainId}.svg`,
    },
    securityNotes,
    docs,
  };
}

function detectApps(
  webappRepo: Repo | undefined,
  repoRoots: Map<string, string>,
): DeepDive["apps"] {
  if (!webappRepo || !repoRoots.has(webappRepo.name)) return [];
  const root = repoRoots.get(webappRepo.name)!;
  const apps: DeepDive["apps"] = [];
  const angularJson = path.join(root, "angular.json");
  if (fs.existsSync(angularJson)) {
    try {
      const aj = JSON.parse(fs.readFileSync(angularJson, "utf8")) as {
        projects?: Record<string, { architect?: { serve?: { options?: { port?: number } } } }>;
      };
      for (const [name, proj] of Object.entries(aj.projects ?? {})) {
        if (name.includes("lib")) continue;
        const port = proj.architect?.serve?.options?.port ?? null;
        const role =
          /erfassung/i.test(name)
            ? "Data entry by the counting circles (Gemeinden)"
            : /monitoring/i.test(name)
              ? "Oversight and audit by the canton / authority"
              : "Angular application";
        apps.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          role,
          port,
        });
      }
    } catch {
      /* ignore */
    }
  }
  if (!apps.length && webappRepo) {
    apps.push({ name: "Web app", role: webappRepo.description, port: null });
  }
  return apps;
}

function detectStack(
  packages: PackageEntry[],
  repos: Repo[],
): DeepDive["stack"] {
  const backend = new Set<string>();
  const frontend = new Set<string>();
  const contracts = new Set<string>();

  if (repos.some((r) => r.type === "service" && r.language === "C#")) {
    backend.add(".NET");
  }
  if (repos.some((r) => r.type === "webapp")) {
    frontend.add("Angular");
    frontend.add("TypeScript");
  }
  if (repos.some((r) => r.type === "proto")) {
    contracts.add("Protobuf / gRPC");
  }

  for (const p of packages) {
    if (p.ecosystem === "nuget") {
      if (/Grpc/i.test(p.name)) backend.add("Grpc.AspNetCore");
      if (/Serilog/i.test(p.name)) backend.add("Serilog");
      if (/prometheus/i.test(p.name)) backend.add("Prometheus");
      if (/EntityFramework/i.test(p.name)) backend.add("EF Core");
      if (/Voting\.Lib/i.test(p.name)) backend.add("Voting.Lib.*");
    }
    if (p.ecosystem === "npm") {
      if (p.name.startsWith("@angular/")) frontend.add("Angular");
      if (p.name === "grpc-web") frontend.add("gRPC-web");
      if (p.name === "otplib") frontend.add("otplib (2FA/OTP)");
      if (p.name.includes("ngx-translate")) frontend.add("ngx-translate (i18n)");
    }
  }

  return {
    backend: [...backend],
    frontend: [...frontend],
    contracts: [...contracts],
  };
}

function collectSecurityNotes(opts: {
  repos: Repo[];
  packages: PackageEntry[];
  repoRoots: Map<string, string>;
}): DeepDive["securityNotes"] {
  const notes: DeepDive["securityNotes"] = [];
  const { repos, packages, repoRoots } = opts;

  for (const p of packages) {
    if (p.name === "otplib") {
      notes.push({
        text: "MFA / 2FA (OTP) dependency present in the frontend package set.",
        kind: "heuristic",
        evidence: [`package:otplib@${p.declaredVersion ?? "?"}`, `repo:${p.repo}`],
      });
    }
  }

  for (const r of repos) {
    const root = repoRoots.get(r.name);
    if (!root) continue;
    const hits = findKeywordEvidence(root, [
      "pkcs11",
      "PKCS11",
      "HSM",
      "EventSignature",
      "SecondFactor",
      "bug.?bounty",
      "eCH-0110",
    ]);
    for (const h of hits) {
      if (/pkcs11|hsm/i.test(h.keyword)) {
        notes.push({
          text: "PKCS#11 / HSM-related artifacts detected — cryptographic event signing surface.",
          kind: "heuristic",
          evidence: [h.path],
        });
      } else if (/EventSignature/i.test(h.keyword)) {
        notes.push({
          text: "Event signature types or docs referenced — integrity-protected event log.",
          kind: "heuristic",
          evidence: [h.path],
        });
      } else if (/SecondFactor/i.test(h.keyword)) {
        notes.push({
          text: "Second-factor transaction surface referenced in contracts or code.",
          kind: "heuristic",
          evidence: [h.path],
        });
      } else if (/eCH-0110/i.test(h.keyword)) {
        notes.push({
          text: "eCH-0110 (Swiss count-of-voters exchange) referenced.",
          kind: "heuristic",
          evidence: [h.path],
        });
      } else if (/bounty/i.test(h.keyword)) {
        notes.push({
          text: "Public bug-bounty program referenced in repository content.",
          kind: "heuristic",
          evidence: [h.path],
        });
      }
    }
  }

  // Dedupe by text
  const seen = new Set<string>();
  return notes.filter((n) => {
    if (seen.has(n.text)) return false;
    seen.add(n.text);
    return true;
  });
}

function findKeywordEvidence(
  root: string,
  keywords: string[],
): Array<{ keyword: string; path: string }> {
  const out: Array<{ keyword: string; path: string }> = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || out.length > 20) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (["node_modules", ".git", "bin", "obj", "dist"].includes(ent.name)) {
        continue;
      }
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, depth + 1);
      else {
        const lower = ent.name.toLowerCase();
        for (const kw of keywords) {
          if (new RegExp(kw, "i").test(ent.name)) {
            out.push({
              keyword: kw,
              path: path.relative(root, p).replace(/\\/g, "/"),
            });
          }
        }
        if (
          /\.(cs|ts|proto|md|json)$/i.test(lower) &&
          fs.statSync(p).size < 200_000
        ) {
          try {
            const text = fs.readFileSync(p, "utf8");
            for (const kw of keywords) {
              if (new RegExp(kw, "i").test(text)) {
                out.push({
                  keyword: kw,
                  path: path.relative(root, p).replace(/\\/g, "/"),
                });
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
  };
  walk(root, 0);
  return out;
}

function buildHeuristicMermaid(opts: {
  domainTitle: string;
  hasWebapp: boolean;
  hasService: boolean;
  hasHsm: boolean;
  hasOtp: boolean;
  linksBasis: boolean;
  linksStimmregister: boolean;
}): string {
  const participants = [
    opts.hasWebapp ? "WebApp as Web app" : null,
    opts.hasService ? "Svc as Domain service" : null,
    opts.linksBasis ? "Basis as Basis" : null,
    opts.linksStimmregister ? "SR as Stimmregister" : null,
    opts.hasHsm ? "HSM as HSM PKCS11" : null,
  ].filter(Boolean);

  if (participants.length < 2) {
    return [
      "sequenceDiagram",
      "  participant Dev as Engineer",
      `  participant Dom as ${opts.domainTitle}`,
      "  Dev->>Dom: Explore domain repos",
      "  Note over Dom: Heuristic placeholder — limited link signals",
    ].join("\n");
  }

  const lines = ["sequenceDiagram", ...participants.map((p) => `  participant ${p}`)];
  if (opts.hasWebapp && opts.hasService) {
    lines.push("  WebApp->>Svc: Load contest / context");
  }
  if (opts.hasService && opts.linksBasis) {
    lines.push("  Svc->>Basis: Master data (contest, DoI, circles)");
  }
  if (opts.hasService && opts.linksStimmregister) {
    lines.push("  Svc->>SR: Count of voters / register queries");
  }
  if (opts.hasWebapp && opts.hasService) {
    lines.push("  WebApp->>Svc: Submit / mutate state");
  }
  if (opts.hasOtp) {
    lines.push("  WebApp->>Svc: Second factor (OTP) on sensitive transition");
  }
  if (opts.hasHsm && opts.hasService) {
    lines.push("  Svc->>HSM: Sign event (PKCS#11)");
    lines.push("  Svc->>Svc: Append signed event");
  }
  lines.push("  Note over WebApp,Svc: Heuristic flow — verify against domain docs");
  return lines.join("\n");
}
