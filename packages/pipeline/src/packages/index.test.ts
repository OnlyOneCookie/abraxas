import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inventoryPackages, isFirstPartyPackage } from "./index.js";

const service = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/voting-ausmittlung-service",
);
const webapp = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/voting-ausmittlung-webapp",
);

describe("inventoryPackages", () => {
  it("marks Voting.* first-party even when version resolves", () => {
    expect(isFirstPartyPackage("Voting.Lib.Grpc")).toBe(true);
    expect(isFirstPartyPackage("Grpc.AspNetCore")).toBe(false);

    const { packages, nugetAudit } = inventoryPackages(
      "voting-ausmittlung-service",
      service,
    );
    expect(nugetAudit?.enabled).toBe(true);

    const grpc = packages.find((p) => p.name === "Grpc.AspNetCore");
    expect(grpc?.declaredVersion).toBe("2.61.0");
    expect(grpc?.osvEligible).toBe(true);
    expect(grpc?.versionSource).toBe("msbuild-props");

    const votingLib = packages.find((p) => p.name === "Voting.Lib.Grpc");
    expect(votingLib?.declaredVersion).toBe("22.0.0");
    expect(votingLib?.osvEligible).toBe(false);
    expect(votingLib?.scope).toBe("first-party");
  });

  it("inventories npm direct deps and excludes @abraxas from OSV", () => {
    const { packages } = inventoryPackages(
      "voting-ausmittlung-webapp",
      webapp,
    );
    const angular = packages.find((p) => p.name === "@angular/core");
    expect(angular?.osvEligible).toBe(true);
    const abraxas = packages.find((p) => p.name === "@abraxas/voting-lib");
    expect(abraxas?.osvEligible).toBe(false);
    expect(abraxas?.scope).toBe("first-party");
  });
});
