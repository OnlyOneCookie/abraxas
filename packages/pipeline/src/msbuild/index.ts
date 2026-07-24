import fs from "node:fs";
import path from "node:path";

export interface MsbuildPropsResult {
  properties: Record<string, string>;
  nugetAudit: { enabled: boolean; evidence?: string };
  filesVisited: string[];
}

const PROPERTY_RE =
  /<(?<name>[A-Za-z_][\w.]*)\s*>(?<value>[^<]*)<\/\k<name>>/g;
const IMPORT_RE =
  /<Import\s+Project\s*=\s*"(?<project>[^"]+)"/gi;

function expandMsbuildPath(projectAttr: string, fromFile: string): string {
  const dir = path.dirname(fromFile);
  let p = projectAttr
    .replace(/\$\(MSBuildThisFileDirectory\)/gi, dir + path.sep)
    .replace(/\\/g, path.sep);
  if (!path.isAbsolute(p)) {
    p = path.resolve(dir, p);
  }
  return path.normalize(p);
}

function parsePropertiesFromXml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of xml.matchAll(PROPERTY_RE)) {
    const name = match.groups?.name;
    const value = match.groups?.value?.trim();
    if (!name || value === undefined) continue;
    // Skip nested MSBuild items that aren't scalar version props
    if (
      [
        "Project",
        "Import",
        "PropertyGroup",
        "ItemGroup",
        "PackageReference",
        "Target",
      ].includes(name)
    ) {
      continue;
    }
    out[name] = value;
  }
  return out;
}

function detectNugetAudit(
  xml: string,
  filePath: string,
): { enabled: boolean; evidence?: string } {
  const warnings =
    xml.match(
      /<WarningsNotAsErrors>\s*([^<]+)\s*<\/WarningsNotAsErrors>/i,
    )?.[1] ?? "";
  if (/NU1902/i.test(warnings) || /NU1903/i.test(warnings)) {
    return {
      enabled: true,
      evidence: `${path.relative(process.cwd(), filePath)}#WarningsNotAsErrors=${warnings.trim()}`,
    };
  }
  if (/<NuGetAudit[^>]*>\s*true\s*<\/NuGetAudit>/i.test(xml)) {
    return {
      enabled: true,
      evidence: `${path.relative(process.cwd(), filePath)}#NuGetAudit=true`,
    };
  }
  if (/NuGetAuditLevel/i.test(xml)) {
    return {
      enabled: true,
      evidence: `${path.relative(process.cwd(), filePath)}#NuGetAuditLevel`,
    };
  }
  return { enabled: false };
}

/**
 * Walk Directory.Build.props → Import chain (config/*.props) and collect
 * scalar MSBuild property literals used for PackageReference versions.
 */
export function resolveMsbuildProps(repoRoot: string): MsbuildPropsResult {
  const properties: Record<string, string> = {};
  let nugetAudit: { enabled: boolean; evidence?: string } = { enabled: false };
  const filesVisited: string[] = [];
  const queue: string[] = [];

  const candidates = [
    path.join(repoRoot, "Directory.Build.props"),
    path.join(repoRoot, "src", "Directory.Build.props"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) queue.push(c);
  }

  // Also pull in config/*.props if present even without Import discovery
  const configDir = path.join(repoRoot, "config");
  if (fs.existsSync(configDir)) {
    for (const f of fs.readdirSync(configDir)) {
      if (f.endsWith(".props")) queue.push(path.join(configDir, f));
    }
  }

  const seen = new Set<string>();
  while (queue.length) {
    const file = queue.shift()!;
    const resolved = path.resolve(file);
    if (seen.has(resolved) || !fs.existsSync(resolved)) continue;
    seen.add(resolved);
    filesVisited.push(resolved);

    const xml = fs.readFileSync(resolved, "utf8");
    Object.assign(properties, parsePropertiesFromXml(xml));

    const audit = detectNugetAudit(xml, resolved);
    if (audit.enabled && !nugetAudit.enabled) nugetAudit = audit;

    for (const m of xml.matchAll(IMPORT_RE)) {
      const project = m.groups?.project;
      if (!project) continue;
      queue.push(expandMsbuildPath(project, resolved));
    }
  }

  return { properties, nugetAudit, filesVisited };
}

const PROP_REF_RE = /^\$\((?<name>[A-Za-z_][\w.]*)\)$/;

export function resolveVersionExpression(
  versionAttr: string | undefined,
  properties: Record<string, string>,
): { version: string | null; property: string | null; source: "literal" | "msbuild-props" | "unresolved" } {
  if (!versionAttr || !versionAttr.trim()) {
    return { version: null, property: null, source: "unresolved" };
  }
  const trimmed = versionAttr.trim();
  const propMatch = PROP_REF_RE.exec(trimmed);
  if (propMatch?.groups?.name) {
    const name = propMatch.groups.name;
    const lit = properties[name];
    if (lit && !lit.includes("$(")) {
      return { version: lit, property: name, source: "msbuild-props" };
    }
    return { version: null, property: name, source: "unresolved" };
  }
  if (trimmed.includes("$(")) {
    // Compound expressions — try simple single-prop only for v1
    return { version: null, property: null, source: "unresolved" };
  }
  return { version: trimmed, property: null, source: "literal" };
}
