import type { ExplorerData } from "@abraxas/schema";
import raw from "../../../../data/data.json";

export const data = raw as ExplorerData;

export const TYPE_COLOR: Record<string, string> = {
  service: "#f78166",
  webapp: "#58a6ff",
  proto: "#3fb950",
  docs: "#d29922",
  library: "#a371f7",
  app: "#39c5cf",
  infra: "#db61a2",
  external: "#6e7681",
  unclassified: "#8b949e",
};

export const LANG_COLOR: Record<string, string> = {
  "C#": "#8250df",
  TypeScript: "#58a6ff",
  Shell: "#3fb950",
  HTML: "#e34c26",
  PowerShell: "#0f6dbe",
  HCL: "#844fba",
  Other: "#8b949e",
  "—": "#484f58",
};

export function shortName(name: string): string {
  if (name === "@abraxas/base-components") return "base-components";
  return name
    .replace(/^voting-/, "")
    .replace(/^per-auskunft-/, "per-")
    .replace(/stimmunterlagen-online-/, "su-online-")
    .replace(/stimmunterlagen-offline-client-/, "offline-");
}

export function gloss(term: string): string | undefined {
  return data.glossary.find(
    (g) => g.term.toLowerCase() === term.toLowerCase(),
  )?.gloss;
}
