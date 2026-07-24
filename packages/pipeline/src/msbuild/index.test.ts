import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMsbuildProps, resolveVersionExpression } from "./index.js";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/voting-ausmittlung-service",
);

describe("resolveMsbuildProps", () => {
  it("resolves Common.props literals and NuGet audit", () => {
    const result = resolveMsbuildProps(fixtures);
    expect(result.properties.GrpcAspNetCoreVersion).toBe("2.61.0");
    expect(result.properties.VotingLibVersion).toBe("22.0.0");
    expect(result.nugetAudit.enabled).toBe(true);
    expect(result.nugetAudit.evidence).toMatch(/NU1902/);
  });

  it("resolves $(Var) expressions", () => {
    const { properties } = resolveMsbuildProps(fixtures);
    expect(
      resolveVersionExpression("$(GrpcAspNetCoreVersion)", properties),
    ).toEqual({
      version: "2.61.0",
      property: "GrpcAspNetCoreVersion",
      source: "msbuild-props",
    });
    expect(
      resolveVersionExpression("$(MissingThing)", properties).source,
    ).toBe("unresolved");
  });
});
