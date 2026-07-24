import { describe, expect, it } from "vitest";
import { sequenceMermaidToSvg } from "./mermaid-to-svg";

describe("sequenceMermaidToSvg", () => {
  it("renders participants and messages to svg", () => {
    const svg = sequenceMermaidToSvg(`sequenceDiagram
  participant WebApp as Web app
  participant Svc as Domain service
  WebApp->>Svc: Load contest
  Note over WebApp,Svc: Heuristic flow`);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Web app");
    expect(svg).toContain("Load contest");
    expect(svg).not.toContain("mermaid");
  });
});
