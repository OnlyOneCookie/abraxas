import fs from "node:fs";
import path from "node:path";
import type { ProjectLink } from "@abraxas/schema";
import { isFirstPartyPackage } from "../packages/index.js";

/** Map known first-party package names to org repo names. */
const PACKAGE_TO_REPO: Record<string, string> = {
  "@abraxas/voting-lib": "voting-library-angular",
  "@abraxas/base-components": "@abraxas/base-components",
  "@abraxas/voting-ausmittlung-service-proto": "voting-ausmittlung-proto",
  "@abraxas/voting-basis-service-proto": "voting-basis-proto",
  "@abraxas/voting-stimmregister-service-proto": "voting-stimmregister-proto",
  "@abraxas/voting-stimmunterlagen-online-service-proto":
    "voting-stimmunterlagen-online-proto",
  "@abraxas/voting-ecollecting-service-proto": "voting-ecollecting-proto",
  "Voting.Lib.Grpc": "voting-library-dotnet",
  "Voting.Lib.Rest": "voting-library-dotnet",
  "Voting.Lib.Prometheus": "voting-library-dotnet",
  "Voting.Lib.DmDoc": "voting-library-dotnet",
  "Voting.Ausmittlung.Service.Proto": "voting-ausmittlung-proto",
  "Voting.Basis.Service.Proto": "voting-basis-proto",
  "Voting.Stimmregister.Service.Proto": "voting-stimmregister-proto",
};

function kindForPackage(pkgName: string): ProjectLink["kind"] {
  if (pkgName.includes("proto") || pkgName.includes("Proto")) return "proto";
  if (pkgName.includes("base-components")) return "external";
  if (pkgName.includes("voting-lib") || pkgName.startsWith("Voting.Lib")) {
    return "shared-lib";
  }
  return "lib";
}

function stripVersion(v: string): string {
  return v.replace(/^[\^~>=<\s]+/, "").trim();
}

export function extractProjectLinksFromNpm(
  sourceRepo: string,
  repoRoot: string,
  knownRepos: Set<string>,
): ProjectLink[] {
  const pkgPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const links: ProjectLink[] = [];
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (!isFirstPartyPackage(name) && !PACKAGE_TO_REPO[name]) continue;
    const target =
      PACKAGE_TO_REPO[name] ??
      (name.startsWith("@abraxas/")
        ? name.replace("@abraxas/", "").replace(/-service-proto$/, "-proto")
        : null);
    if (!target) continue;
    if (target !== "@abraxas/base-components" && !knownRepos.has(target)) {
      // Still emit external/design-system node
      if (!name.includes("base-components")) continue;
    }
    links.push({
      sourceRepo,
      targetRepo: target,
      version: stripVersion(version) || null,
      kind: kindForPackage(name),
      source: "package.json",
    });
  }
  return links;
}

export function extractProjectLinksFromCsproj(
  sourceRepo: string,
  repoRoot: string,
  knownRepos: Set<string>,
): ProjectLink[] {
  const links: ProjectLink[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (["node_modules", "bin", "obj", ".git"].includes(ent.name)) continue;
        walk(p);
      } else if (ent.name.endsWith(".csproj")) {
        const xml = fs.readFileSync(p, "utf8");
        for (const m of xml.matchAll(
          /<PackageReference\s+Include="(?<name>[^"]+)"[^>]*Version="(?<version>[^"]+)"/gi,
        )) {
          const name = m.groups?.name;
          if (!name || !isFirstPartyPackage(name)) continue;
          const target = PACKAGE_TO_REPO[name];
          if (!target || (!knownRepos.has(target) && target !== "@abraxas/base-components")) {
            if (target === "voting-library-dotnet" || target?.includes("proto")) {
              // allow mapped targets even if not yet in set during fixtures
            } else if (!target) continue;
          }
          if (!target) continue;
          links.push({
            sourceRepo,
            targetRepo: target,
            version: m.groups?.version?.startsWith("$(")
              ? null
              : m.groups?.version ?? null,
            kind: kindForPackage(name),
            source: "csproj",
          });
        }
      }
    }
  };
  walk(repoRoot);
  return links;
}

export function extractSubmoduleLinks(
  sourceRepo: string,
  repoRoot: string,
): ProjectLink[] {
  const gm = path.join(repoRoot, ".gitmodules");
  if (!fs.existsSync(gm)) return [];
  const text = fs.readFileSync(gm, "utf8");
  const links: ProjectLink[] = [];
  const blocks = text.split(/\[submodule /);
  for (const block of blocks) {
    const url = block.match(/url\s*=\s*(.+)/)?.[1]?.trim();
    if (!url) continue;
    let target: string | null = null;
    if (url.includes("voting-library-validation-proto")) {
      target = "voting-library-validation-proto";
    } else {
      const m = url.match(/abraxas-labs\/([^/\s.]+)(?:\.git)?/);
      if (m?.[1]) target = m[1];
      else if (url.includes("voting-library")) {
        target = "voting-library-validation-proto";
      }
    }
    if (!target) continue;
    links.push({
      sourceRepo,
      targetRepo: target,
      version: null,
      kind: "validation",
      source: ".gitmodules",
    });
  }
  return links;
}

/** Convention-based domain→domain and type→proto edges when manifests are thin. */
export function conventionLinks(
  repos: Array<{ name: string; domain: string; type: string }>,
): ProjectLink[] {
  const byDomain = new Map<string, typeof repos>();
  for (const r of repos) {
    const list = byDomain.get(r.domain) ?? [];
    list.push(r);
    byDomain.set(r.domain, list);
  }
  const links: ProjectLink[] = [];
  const nameSet = new Set(repos.map((r) => r.name));

  for (const r of repos) {
    if (r.type === "webapp" || r.type === "service") {
      const proto = repos.find((x) => x.domain === r.domain && x.type === "proto");
      if (proto && proto.name !== r.name) {
        links.push({
          sourceRepo: r.name,
          targetRepo: proto.name,
          version: null,
          kind: "proto",
          source: "convention",
        });
      }
    }
    if (r.type === "webapp" && nameSet.has("voting-library-angular")) {
      links.push({
        sourceRepo: r.name,
        targetRepo: "voting-library-angular",
        version: null,
        kind: "shared-lib",
        source: "convention",
      });
    }
    if (
      (r.type === "service" || r.type === "app" || r.type === "library") &&
      nameSet.has("voting-library-dotnet") &&
      r.name !== "voting-library-dotnet"
    ) {
      links.push({
        sourceRepo: r.name,
        targetRepo: "voting-library-dotnet",
        version: null,
        kind: "shared-lib",
        source: "convention",
      });
    }
    if (r.type === "proto" && r.name !== "voting-library-validation-proto") {
      if (nameSet.has("voting-library-validation-proto")) {
        links.push({
          sourceRepo: r.name,
          targetRepo: "voting-library-validation-proto",
          version: null,
          kind: "validation",
          source: "convention",
        });
      }
    }
  }

  // Integration variants
  const integrations: Array<[string, string]> = [
    ["voting-stimmregister-evoting", "voting-stimmregister-service"],
    ["voting-stimmregister-eservice", "voting-stimmregister-service"],
    ["voting-ecollecting-citizen-eservice", "voting-ecollecting-service"],
    [
      "voting-stimmunterlagen-offline-client-app",
      "voting-stimmunterlagen-offline-client-shared",
    ],
  ];
  for (const [s, t] of integrations) {
    if (nameSet.has(s) && nameSet.has(t)) {
      links.push({
        sourceRepo: s,
        targetRepo: t,
        version: null,
        kind: s.includes("offline") ? "lib" : "integration",
        source: "convention",
      });
    }
  }

  const domainPairs: Array<[string, string]> = [
    ["ausmittlung", "basis"],
    ["ausmittlung", "stimmregister"],
    ["ecollecting", "basis"],
    ["ecollecting", "stimmregister"],
    ["wahlvorschlag", "basis"],
    ["su-online", "basis"],
    ["su-online", "stimmregister"],
  ];
  for (const [a, b] of domainPairs) {
    const sa = repos.find((r) => r.domain === a && r.type === "service");
    const sb = repos.find((r) => r.domain === b && r.type === "service");
    if (sa && sb) {
      links.push({
        sourceRepo: sa.name,
        targetRepo: sb.name,
        version: null,
        kind: "domain",
        source: "convention",
      });
    }
  }

  return dedupeLinks(links);
}

function dedupeLinks(links: ProjectLink[]): ProjectLink[] {
  const map = new Map<string, ProjectLink>();
  for (const l of links) {
    const key = `${l.sourceRepo}|${l.targetRepo}|${l.kind}`;
    const existing = map.get(key);
    if (!existing || (l.version && !existing.version)) {
      map.set(key, l);
    }
  }
  return [...map.values()];
}

export function buildProjectLinks(
  repos: Array<{ name: string; domain: string; type: string; root: string }>,
): ProjectLink[] {
  const known = new Set(repos.map((r) => r.name));
  known.add("@abraxas/base-components");
  const fromManifests: ProjectLink[] = [];
  for (const r of repos) {
    fromManifests.push(
      ...extractProjectLinksFromNpm(r.name, r.root, known),
      ...extractProjectLinksFromCsproj(r.name, r.root, known),
      ...extractSubmoduleLinks(r.name, r.root),
    );
  }
  return dedupeLinks([...fromManifests, ...conventionLinks(repos)]);
}
