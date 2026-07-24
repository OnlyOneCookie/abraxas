import fs from "node:fs";
import type { ExplorerData } from "@abraxas/schema";
import { listOrgRepos, type GhRepo } from "../collect/index.js";

/** Stable fingerprint of org repo set + last push times. */
export function orgFingerprint(repos: Array<{ name: string; pushedAt: string | null }>): string {
  return repos
    .map((r) => `${r.name}@${r.pushedAt ?? ""}`)
    .sort()
    .join("|");
}

export function fingerprintFromExplorerData(data: ExplorerData): string {
  return orgFingerprint(
    data.repos
      .filter((r) => r.type !== "external")
      .map((r) => ({ name: r.name, pushedAt: r.lastPush })),
  );
}

export function fingerprintFromGhRepos(repos: GhRepo[]): string {
  return orgFingerprint(
    repos.map((r) => ({ name: r.name, pushedAt: r.pushedAt })),
  );
}

export function loadExistingData(outPath: string): ExplorerData | null {
  if (!fs.existsSync(outPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(outPath, "utf8")) as ExplorerData;
  } catch {
    return null;
  }
}

export interface ChangeCheckResult {
  unchanged: boolean;
  remoteCount: number;
  previousCount: number;
  remoteFingerprint: string;
  previousFingerprint: string | null;
  remoteRepos: GhRepo[];
}

/**
 * Lightweight GitHub API check — no clones.
 * Compares current org pushedAt map to the last emitted data.json.
 */
export async function checkOrgChanges(opts: {
  org: string;
  outPath: string;
  token?: string;
}): Promise<ChangeCheckResult> {
  const remoteRepos = await listOrgRepos({
    org: opts.org,
    token: opts.token ?? process.env.GITHUB_TOKEN,
  });
  const remoteFingerprint = fingerprintFromGhRepos(remoteRepos);
  const existing = loadExistingData(opts.outPath);
  const previousFingerprint = existing
    ? fingerprintFromExplorerData(existing)
    : null;
  const previousCount = existing
    ? existing.repos.filter((r) => r.type !== "external").length
    : 0;

  return {
    unchanged:
      previousFingerprint != null && remoteFingerprint === previousFingerprint,
    remoteCount: remoteRepos.length,
    previousCount,
    remoteFingerprint,
    previousFingerprint,
    remoteRepos,
  };
}
