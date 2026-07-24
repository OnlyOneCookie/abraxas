import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { DocLink } from "@abraxas/schema";

export function indexDocsRepo(
  repoName: string,
  repoRoot: string,
  org = "abraxas-labs",
): DocLink[] {
  const files = fg.sync(["**/*.{pdf,md,markdown,html}"], {
    cwd: repoRoot,
    absolute: false,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  const links: DocLink[] = [];
  for (const rel of files.slice(0, 80)) {
    const base = path.basename(rel);
    if (base.toLowerCase() === "readme.md") continue;
    const title = base
      .replace(/\.(pdf|md|markdown|html)$/i, "")
      .replace(/[-_]/g, " ");
    const format = /\.pdf$/i.test(base)
      ? "pdf"
      : /\.html$/i.test(base)
        ? "other"
        : "md";
    links.push({
      title,
      url: `https://github.com/${org}/${repoName}/blob/main/${rel.replace(/\\/g, "/")}`,
      format,
    });
  }
  return links;
}

export function findChangelogVersion(repoRoot: string): string | null {
  const candidates = ["CHANGELOG.md", "CHANGELOG", "CHANGES.md"];
  for (const c of candidates) {
    const p = path.join(repoRoot, c);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8").slice(0, 4000);
    const m = text.match(/#{1,3}\s*\[?v?(\d+\.\d+\.\d+)/);
    if (m?.[1]) return m[1];
  }
  return null;
}
