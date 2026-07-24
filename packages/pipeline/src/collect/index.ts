import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GhRepo {
  name: string;
  description: string | null;
  language: string | null;
  pushedAt: string | null;
  stargazerCount: number;
  forkCount: number;
  url: string;
  isArchived: boolean;
  repositoryTopics?: { nodes?: Array<{ topic?: { name?: string } }> };
  latestRelease?: { tagName?: string; name?: string } | null;
}

export interface ClonedRepo {
  name: string;
  root: string;
  meta: GhRepo;
  health: {
    clone: "ok" | "failed";
    submodules: "ok" | "partial" | "skipped" | "none";
    error?: string;
  };
}

interface ListReposOptions {
  org: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export async function listOrgRepos(
  opts: ListReposOptions,
): Promise<GhRepo[]> {
  const { org, token, fetchImpl = fetch } = opts;
  const repos: GhRepo[] = [];
  let page = 1;
  for (;;) {
    const url = `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&type=public`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "abraxas-github-explorer",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub list repos failed: ${res.status} ${await res.text()}`);
    }
    const batch = (await res.json()) as Array<{
      name: string;
      description: string | null;
      language: string | null;
      pushed_at: string | null;
      stargazers_count: number;
      forks_count: number;
      html_url: string;
      archived: boolean;
      topics?: string[];
    }>;
    if (!batch.length) break;
    for (const r of batch) {
      repos.push({
        name: r.name,
        description: r.description,
        language: r.language,
        pushedAt: r.pushed_at,
        stargazerCount: r.stargazers_count,
        forkCount: r.forks_count,
        url: r.html_url,
        isArchived: r.archived,
        repositoryTopics: {
          nodes: (r.topics ?? []).map((t) => ({ topic: { name: t } })),
        },
      });
    }
    if (batch.length < 100) break;
    page += 1;
  }
  return repos.filter((r) => !r.isArchived);
}

export async function shallowCloneRepo(opts: {
  org: string;
  name: string;
  destDir: string;
  recurseSubmodules?: boolean;
}): Promise<ClonedRepo["health"]> {
  const { org, name, destDir, recurseSubmodules } = opts;
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  const url = `https://github.com/${org}/${name}.git`;
  try {
    await execFileAsync(
      "git",
      ["clone", "--depth", "1", "--single-branch", url, destDir],
      { timeout: 120_000 },
    );
  } catch (err) {
    return {
      clone: "failed",
      submodules: "none",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const gitmodules = path.join(destDir, ".gitmodules");
  if (!fs.existsSync(gitmodules)) {
    return { clone: "ok", submodules: "none" };
  }

  if (!recurseSubmodules) {
    return { clone: "ok", submodules: "skipped" };
  }

  try {
    await execFileAsync(
      "git",
      ["submodule", "update", "--init", "--depth", "1", "--recursive"],
      { cwd: destDir, timeout: 120_000 },
    );
    return { clone: "ok", submodules: "ok" };
  } catch (err) {
    // Relative internal submodule URLs often fail on the public mirror
    return {
      clone: "ok",
      submodules: "partial",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function collectOrg(opts: {
  org: string;
  workspaceDir: string;
  token?: string;
  recurseSubmodules?: boolean;
}): Promise<ClonedRepo[]> {
  const repos = await listOrgRepos({
    org: opts.org,
    token: opts.token ?? process.env.GITHUB_TOKEN,
  });
  const out: ClonedRepo[] = [];
  for (const meta of repos) {
    const dest = path.join(opts.workspaceDir, meta.name);
    const shouldRecurse =
      opts.recurseSubmodules !== false &&
      (meta.name.endsWith("-proto") || meta.name.includes("proto"));
    const health = await shallowCloneRepo({
      org: opts.org,
      name: meta.name,
      destDir: dest,
      recurseSubmodules: shouldRecurse,
    });
    out.push({
      name: meta.name,
      root: dest,
      meta,
      health: {
        clone: health.clone,
        submodules: health.submodules,
        error: health.error,
      },
    });
    console.log(
      `[collect] ${meta.name}: clone=${health.clone} submodules=${health.submodules}`,
    );
  }
  return out;
}
