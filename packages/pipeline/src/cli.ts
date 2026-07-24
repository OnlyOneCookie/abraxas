#!/usr/bin/env node
import { runPipeline } from "./run.js";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const fixtures = args.includes("--fixtures");
  const skipVuln = args.includes("--skip-vuln");
  const force = args.includes("--force");
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const triggerIdx = args.indexOf("--trigger");
  const trigger = triggerIdx >= 0 ? args[triggerIdx + 1] : undefined;

  const data = await runPipeline({
    fixtures,
    skipVulnScan: skipVuln,
    force,
    skipIfUnchanged: !force && !fixtures,
    outPath,
    triggers: trigger
      ? [trigger]
      : fixtures
        ? ["fixtures"]
        : ["manual"],
  });

  console.log(
    `[pipeline] done repos=${data.meta.coverage.repos} packages=${data.packages.length} vulns=${data.vulnerabilities.length} deepDives=${Object.keys(data.deepDives).length} generatedAt=${data.generatedAt}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
