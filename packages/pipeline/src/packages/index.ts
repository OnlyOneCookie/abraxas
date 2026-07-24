import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { PackageEntry } from "@abraxas/schema";
import {
  resolveMsbuildProps,
  resolveVersionExpression,
} from "../msbuild/index.js";

export function isFirstPartyPackage(name: string): boolean {
  if (name.startsWith("@abraxas/")) return true;
  if (name.startsWith("Voting.")) return true;
  return false;
}

function stripVersionRange(v: string): string {
  return v.replace(/^[\^~>=<\s]+/, "").trim();
}

export function inventoryNpmPackages(
  repoName: string,
  repoRoot: string,
): PackageEntry[] {
  const pkgPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const out: PackageEntry[] = [];
  const add = (deps: Record<string, string> | undefined, dev: boolean) => {
    if (!deps) return;
    for (const [name, version] of Object.entries(deps)) {
      const firstParty = isFirstPartyPackage(name);
      const declared = stripVersionRange(version);
      out.push({
        repo: repoName,
        ecosystem: "npm",
        name,
        declaredVersion: declared || null,
        installedVersion: null,
        direct: true,
        transitive: false,
        scope: firstParty ? "first-party" : "third-party",
        osvEligible: !firstParty && Boolean(declared) && !declared.startsWith("file:"),
        versionSource: "package.json",
        dev,
      });
    }
  };
  add(pkg.dependencies, false);
  add(pkg.devDependencies, true);
  return out;
}

const PACKAGE_REF_RE =
  /<PackageReference\s+(?<attrs>[^>]*?)\s*\/?>/gi;
const INCLUDE_ATTR_RE = /Include="(?<name>[^"]+)"/i;
const VERSION_ATTR_RE = /Version="(?<version>[^"]+)"/i;

export function inventoryNugetPackages(
  repoName: string,
  repoRoot: string,
): { packages: PackageEntry[]; nugetAudit: { enabled: boolean; evidence?: string } } {
  const { properties, nugetAudit } = resolveMsbuildProps(repoRoot);
  const csprojs = fg.sync(["**/*.{csproj,props}"], {
    cwd: repoRoot,
    absolute: true,
    ignore: ["**/node_modules/**", "**/bin/**", "**/obj/**"],
  });

  const seen = new Set<string>();
  const packages: PackageEntry[] = [];

  for (const file of csprojs) {
    const xml = fs.readFileSync(file, "utf8");
    for (const match of xml.matchAll(PACKAGE_REF_RE)) {
      const attrs = match.groups?.attrs ?? "";
      const name = INCLUDE_ATTR_RE.exec(attrs)?.groups?.name;
      if (!name) continue;
      const versionAttr = VERSION_ATTR_RE.exec(attrs)?.groups?.version;
      const resolved = resolveVersionExpression(versionAttr, properties);
      const firstParty = isFirstPartyPackage(name);
      const key = `${name}@${resolved.version ?? resolved.property ?? "?"}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let versionSource: PackageEntry["versionSource"] = "csproj";
      if (resolved.source === "msbuild-props") versionSource = "msbuild-props";
      else if (resolved.source === "unresolved") versionSource = "central-unresolved";
      else if (path.basename(file) === "Directory.Packages.props") {
        versionSource = "directory-packages";
      }

      packages.push({
        repo: repoName,
        ecosystem: "nuget",
        name,
        declaredVersion: resolved.version,
        msbuildProperty: resolved.property,
        installedVersion: null,
        direct: true,
        transitive: false,
        scope: firstParty ? "first-party" : "third-party",
        osvEligible:
          !firstParty &&
          resolved.source !== "unresolved" &&
          Boolean(resolved.version),
        versionSource,
        dev: false,
      });
    }
  }

  return { packages, nugetAudit };
}

export function inventoryPackages(
  repoName: string,
  repoRoot: string,
): {
  packages: PackageEntry[];
  nugetAudit?: { enabled: boolean; evidence?: string };
} {
  const npm = inventoryNpmPackages(repoName, repoRoot);
  const nuget = inventoryNugetPackages(repoName, repoRoot);
  return {
    packages: [...npm, ...nuget.packages],
    nugetAudit: nuget.nugetAudit.enabled ? nuget.nugetAudit : undefined,
  };
}
