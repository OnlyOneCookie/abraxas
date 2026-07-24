import fs from "node:fs";
import path from "node:path";

export type UpdatePhase = "idle" | "running" | "success" | "error" | "skipped";

export interface UpdateStatusFile {
  phase: UpdatePhase;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  generatedAt: string | null;
  error: string | null;
  pid: number | null;
  skipped?: boolean;
}

export function writeUpdateStatus(
  root: string,
  status: UpdateStatusFile,
): void {
  const p = path.join(root, "data", "update-status.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(status, null, 2) + "\n");
}
