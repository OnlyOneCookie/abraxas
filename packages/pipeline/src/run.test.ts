import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { runPipeline } from "./run.js";

describe("runPipeline fixtures", () => {
  it("emits valid data.json from fixtures without live OSV", async () => {
    const out = path.join(os.tmpdir(), `explorer-data-${Date.now()}.json`);
    const data = await runPipeline({
      fixtures: true,
      skipVulnScan: true,
      outPath: out,
      triggers: ["fixtures"],
    });
    expect(data.meta.vulnScan.mode ?? "direct").toBeTruthy();
    expect(data.repos.length).toBeGreaterThan(3);
    expect(data.deepDives.ausmittlung).toBeDefined();
    expect(data.deepDives.ausmittlung?.apiSurface.source).toBe("proto");
    expect(data.deepDives.wahlvorschlag?.apiSurface.source).toBe("unavailable");
    const grpc = data.packages.find((p) => p.name === "Grpc.AspNetCore");
    expect(grpc?.osvEligible).toBe(true);
    expect(grpc?.declaredVersion).toBe("2.61.0");
    const voting = data.packages.find((p) => p.name === "Voting.Lib.Grpc");
    expect(voting?.osvEligible).toBe(false);
    expect(
      data.repos.find((r) => r.name === "voting-ausmittlung-service")
        ?.nugetAudit?.enabled,
    ).toBe(true);
    expect(fs.existsSync(out)).toBe(true);
  });
});
