import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseProtos } from "./index.js";

const protoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/voting-ausmittlung-proto",
);
const wahl = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/voting-wahlvorschlag-service",
);

describe("parseProtos", () => {
  it("parses services and marks validation import unavailable", () => {
    const result = parseProtos(protoRoot);
    expect(result.apiSurface.source).toBe("proto");
    expect(result.apiSurface.services.map((s) => s.name)).toContain(
      "ContestService",
    );
    expect(
      result.apiSurface.unresolvedImports.some((u) =>
        u.import.includes("validation"),
      ),
    ).toBe(true);
    expect(result.dataModel.source).toBe("proto-messages");
    expect(
      result.dataModel.groups.some((g) => g.messages.includes("Contest")),
    ).toBe(true);
  });

  it("degrades when no proto files exist", () => {
    const result = parseProtos(wahl);
    expect(result.apiSurface.source).toBe("unavailable");
  });
});
