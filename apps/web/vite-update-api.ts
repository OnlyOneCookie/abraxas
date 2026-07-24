import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

export interface UpdateStatusFile {
  phase: "idle" | "running" | "success" | "error" | "skipped";
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  generatedAt: string | null;
  error: string | null;
  pid: number | null;
  skipped?: boolean;
  updateAvailable?: boolean | null;
  checkedAt?: string | null;
  remoteCount?: number | null;
}

function repoRootFromWebApp(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../..");
}

function statusPath(root: string): string {
  return path.join(root, "data", "update-status.json");
}

function readStatus(root: string): UpdateStatusFile {
  const p = statusPath(root);
  if (!fs.existsSync(p)) {
    return {
      phase: "idle",
      message: "Ready",
      startedAt: null,
      finishedAt: null,
      generatedAt: null,
      error: null,
      pid: null,
      updateAvailable: null,
      checkedAt: null,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as UpdateStatusFile;
  } catch {
    return {
      phase: "idle",
      message: "Ready",
      startedAt: null,
      finishedAt: null,
      generatedAt: null,
      error: null,
      pid: null,
      updateAvailable: null,
      checkedAt: null,
    };
  }
}

function writeStatus(root: string, status: UpdateStatusFile) {
  fs.mkdirSync(path.dirname(statusPath(root)), { recursive: true });
  fs.writeFileSync(statusPath(root), JSON.stringify(status, null, 2) + "\n");
}

function readDataMeta(root: string): {
  generatedAt: string | null;
  fingerprint: string | null;
  repoCount: number;
} {
  const dataPath = path.join(root, "data", "data.json");
  if (!fs.existsSync(dataPath)) {
    return { generatedAt: null, fingerprint: null, repoCount: 0 };
  }
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8")) as {
      generatedAt?: string;
      repos?: Array<{ name: string; lastPush: string | null; type?: string }>;
    };
    const repos = (data.repos ?? []).filter((r) => r.type !== "external");
    const fingerprint = repos
      .map((r) => `${r.name}@${r.lastPush ?? ""}`)
      .sort()
      .join("|");
    return {
      generatedAt: data.generatedAt ?? null,
      fingerprint,
      repoCount: repos.length,
    };
  } catch {
    return { generatedAt: null, fingerprint: null, repoCount: 0 };
  }
}

async function fetchRemoteFingerprint(
  token?: string,
): Promise<{ fingerprint: string; count: number }> {
  const repos: Array<{ name: string; pushed_at: string | null }> = [];
  let page = 1;
  for (;;) {
    const url = `https://api.github.com/orgs/abraxas-labs/repos?per_page=100&page=${page}&type=public`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "abraxas-github-explorer",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}`);
    }
    const batch = (await res.json()) as Array<{
      name: string;
      pushed_at: string | null;
      archived: boolean;
    }>;
    if (!batch.length) break;
    for (const r of batch) {
      if (!r.archived) repos.push({ name: r.name, pushed_at: r.pushed_at });
    }
    if (batch.length < 100) break;
    page += 1;
  }
  const fingerprint = repos
    .map((r) => `${r.name}@${r.pushed_at ?? ""}`)
    .sort()
    .join("|");
  return { fingerprint, count: repos.length };
}

function sendJson(
  res: import("http").ServerResponse,
  code: number,
  body: unknown,
) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * Dev-only API:
 *   GET  /api/update/status
 *   POST /api/update/check — lightweight org fingerprint compare
 *   POST /api/update/run   — starts live org pipeline (background)
 */
export function updateApiPlugin(): Plugin {
  return {
    name: "abraxas-update-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/update/")) return next();

        const root = repoRootFromWebApp();

        if (url === "/api/update/status" && req.method === "GET") {
          return sendJson(res, 200, readStatus(root));
        }

        if (url === "/api/update/check" && req.method === "POST") {
          void (async () => {
            try {
              const local = readDataMeta(root);
              const remote = await fetchRemoteFingerprint(
                process.env.GITHUB_TOKEN,
              );
              const updateAvailable =
                local.fingerprint == null ||
                local.fingerprint !== remote.fingerprint;
              const checkedAt = new Date().toISOString();
              const prev = readStatus(root);
              const next: UpdateStatusFile = {
                ...prev,
                phase: prev.phase === "running" ? "running" : "idle",
                message: updateAvailable
                  ? "Update available"
                  : "Up to date",
                generatedAt: local.generatedAt,
                updateAvailable,
                checkedAt,
                remoteCount: remote.count,
                error: null,
              };
              writeStatus(root, next);
              sendJson(res, 200, next);
            } catch (err) {
              sendJson(res, 500, {
                phase: "error",
                message: err instanceof Error ? err.message : String(err),
                updateAvailable: null,
              });
            }
          })();
          return;
        }

        if (url === "/api/update/run" && req.method === "POST") {
          const current = readStatus(root);
          if (current.phase === "running" && current.pid) {
            try {
              process.kill(current.pid, 0);
              return sendJson(res, 200, {
                ...current,
                message: "Update already running",
              });
            } catch {
              /* continue */
            }
          }

          const startedAt = new Date().toISOString();
          writeStatus(root, {
            phase: "running",
            message: "Updating…",
            startedAt,
            finishedAt: null,
            generatedAt: readDataMeta(root).generatedAt,
            error: null,
            pid: null,
            updateAvailable: true,
            checkedAt: current.checkedAt ?? null,
          });

          const child = spawn(
            "pnpm",
            [
              "--filter",
              "@abraxas/pipeline",
              "start",
              "--",
              "--trigger",
              "update-now",
            ],
            {
              cwd: root,
              env: {
                ...process.env,
                VULN_SCAN_ENABLED: process.env.VULN_SCAN_ENABLED ?? "true",
              },
              detached: true,
              stdio: "ignore",
              shell: true,
            },
          );
          child.unref();

          writeStatus(root, {
            phase: "running",
            message: "Updating…",
            startedAt,
            finishedAt: null,
            generatedAt: readDataMeta(root).generatedAt,
            error: null,
            pid: child.pid ?? null,
            updateAvailable: true,
            checkedAt: current.checkedAt ?? null,
          });

          child.on("exit", (code) => {
            const finishedAt = new Date().toISOString();
            const local = readDataMeta(root);
            const disk = readStatus(root);
            if (disk.phase === "skipped") {
              writeStatus(root, {
                ...disk,
                phase: "skipped",
                finishedAt,
                updateAvailable: false,
                message: "Up to date",
                pid: null,
              });
              return;
            }
            if (code === 0) {
              writeStatus(root, {
                phase: "success",
                message: "Up to date",
                startedAt,
                finishedAt,
                generatedAt: local.generatedAt,
                error: null,
                pid: null,
                skipped: false,
                updateAvailable: false,
                checkedAt: finishedAt,
                remoteCount: local.repoCount,
              });
            } else {
              writeStatus(root, {
                phase: "error",
                message: `Pipeline exited with code ${code}`,
                startedAt,
                finishedAt,
                generatedAt: local.generatedAt,
                error: `exit ${code}`,
                pid: null,
                updateAvailable: true,
                checkedAt: disk.checkedAt ?? null,
              });
            }
          });

          return sendJson(res, 202, readStatus(root));
        }

        return sendJson(res, 404, { message: "Not found" });
      });
    },
  };
}
