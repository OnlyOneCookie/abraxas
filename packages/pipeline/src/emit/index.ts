import fs from "node:fs";
import path from "node:path";
import {
  parseExplorerData,
  type ExplorerData,
} from "@abraxas/schema";

export function emitDataJson(
  data: ExplorerData,
  outPath: string,
): ExplorerData {
  const parsed = parseExplorerData(data);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
  return parsed;
}
