import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { ApiSurface, DataModel } from "@abraxas/schema";

export interface ProtoParseResult {
  apiSurface: ApiSurface;
  dataModel: DataModel;
}

const SERVICE_RE = /service\s+(\w+)\s*\{([^}]*)\}/gs;
const RPC_RE =
  /rpc\s+(\w+)\s*\(\s*([\w.]+)\s*\)\s*returns\s*\(\s*([\w.]+)\s*\)/g;
const MESSAGE_RE = /message\s+(\w+)\s*\{/g;
const IMPORT_RE = /import\s+"([^"]+)"\s*;/g;

/**
 * Parse .proto files under repoRoot. Missing validation imports degrade to
 * unavailable — never throws for unresolved imports.
 */
export function parseProtos(repoRoot: string): ProtoParseResult {
  const files = fg.sync(["**/*.proto"], {
    cwd: repoRoot,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  if (!files.length) {
    return {
      apiSurface: {
        source: "unavailable",
        services: [],
        unresolvedImports: [],
      },
      dataModel: { source: "unavailable", groups: [] },
    };
  }

  const services: ApiSurface["services"] = [];
  const messages: string[] = [];
  const unresolvedImports: ApiSurface["unresolvedImports"] = [];
  const seenImports = new Set<string>();

  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const m of text.matchAll(IMPORT_RE)) {
      const imp = m[1]!;
      if (seenImports.has(imp)) continue;
      seenImports.add(imp);
      const resolved = resolveImport(repoRoot, path.dirname(file), imp);
      if (!resolved) {
        unresolvedImports.push({
          import: imp,
          status: imp.includes("validation") ? "unavailable" : "external",
        });
      }
    }

    for (const sm of text.matchAll(SERVICE_RE)) {
      const name = sm[1]!;
      const body = sm[2] ?? "";
      const methods: ApiSurface["services"][0]["methods"] = [];
      for (const rm of body.matchAll(RPC_RE)) {
        methods.push({
          name: rm[1]!,
          request: rm[2]!,
          response: rm[3]!,
        });
      }
      services.push({ name, methods });
    }

    for (const mm of text.matchAll(MESSAGE_RE)) {
      messages.push(mm[1]!);
    }
  }

  const groups = groupMessages(messages);

  return {
    apiSurface: {
      source: services.length ? "proto" : "unavailable",
      services,
      unresolvedImports,
    },
    dataModel: {
      source: messages.length ? "proto-messages" : "unavailable",
      groups,
    },
  };
}

function resolveImport(
  repoRoot: string,
  fromDir: string,
  imp: string,
): string | null {
  const candidates = [
    path.join(fromDir, imp),
    path.join(repoRoot, imp),
    path.join(repoRoot, "src", imp),
    path.join(repoRoot, "proto", imp),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function groupMessages(messages: string[]): DataModel["groups"] {
  const buckets: Record<string, string[]> = {
    "Contest & political business": [],
    Territory: [],
    "Results & ballots": [],
    "Exports & integrity": [],
    Other: [],
  };
  for (const m of [...new Set(messages)].sort()) {
    const lower = m.toLowerCase();
    if (
      /contest|vote|election|political|union|majority|proportional/i.test(m)
    ) {
      buckets["Contest & political business"]!.push(m);
    } else if (
      /domain|canton|counting|circle|electorate|machine|territory/i.test(lower)
    ) {
      buckets.Territory!.push(m);
    } else if (
      /result|ballot|bundle|candidate|lot|write.?in|endresult/i.test(lower)
    ) {
      buckets["Results & ballots"]!.push(m);
    } else if (
      /export|signature|secondfactor|protocol|template/i.test(lower)
    ) {
      buckets["Exports & integrity"]!.push(m);
    } else {
      buckets.Other!.push(m);
    }
  }
  return Object.entries(buckets)
    .filter(([, msgs]) => msgs.length)
    .map(([title, msgs]) => ({ title, messages: msgs }));
}
