import { describe, expect, it } from "vitest";
import {
  fingerprintFromGhRepos,
  orgFingerprint,
} from "./index.js";

describe("orgFingerprint", () => {
  it("is order-independent", () => {
    const a = orgFingerprint([
      { name: "b", pushedAt: "2" },
      { name: "a", pushedAt: "1" },
    ]);
    const b = orgFingerprint([
      { name: "a", pushedAt: "1" },
      { name: "b", pushedAt: "2" },
    ]);
    expect(a).toBe(b);
  });

  it("changes when a repo is pushed", () => {
    const before = fingerprintFromGhRepos([
      {
        name: "r",
        description: null,
        language: null,
        pushedAt: "2026-01-01T00:00:00Z",
        stargazerCount: 0,
        forkCount: 0,
        url: "",
        isArchived: false,
      },
    ]);
    const after = fingerprintFromGhRepos([
      {
        name: "r",
        description: null,
        language: null,
        pushedAt: "2026-01-02T00:00:00Z",
        stargazerCount: 0,
        forkCount: 0,
        url: "",
        isArchived: false,
      },
    ]);
    expect(before).not.toBe(after);
  });
});
