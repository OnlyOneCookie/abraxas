import { describe, expect, it } from "vitest";
import { classifyRepo } from "./index.js";

describe("classifyRepo", () => {
  it("classifies ausmittlung service", () => {
    const c = classifyRepo("voting-ausmittlung-service");
    expect(c.domain).toBe("ausmittlung");
    expect(c.type).toBe("service");
    expect(c.product).toBe("voting");
    expect(c.securityCritical).toBe(true);
  });

  it("maps stimmunterlagen-online to su-online", () => {
    const c = classifyRepo("voting-stimmunterlagen-online-webapp");
    expect(c.domain).toBe("su-online");
    expect(c.type).toBe("webapp");
  });

  it("maps offline client-shared to library", () => {
    const c = classifyRepo("voting-stimmunterlagen-offline-client-shared");
    expect(c.domain).toBe("su-offline");
    expect(c.type).toBe("library");
  });

  it("classifies shared libraries", () => {
    expect(classifyRepo("voting-library-dotnet").type).toBe("library");
    expect(classifyRepo("voting-library-angular").domain).toBe("shared");
    expect(classifyRepo("voting-library-validation-proto").type).toBe("proto");
  });

  it("falls back to unclassified", () => {
    const c = classifyRepo("random-thing-xyz");
    expect(c.domain).toBe("unclassified");
    expect(c.type).toBe("unclassified");
  });

  it("classifies terraform as infra", () => {
    const c = classifyRepo("terraform-citrixdaas-citrix-daas-published-applications");
    expect(c.domain).toBe("infra");
    expect(c.type).toBe("infra");
  });

  it("classifies wahlvorschlag without proto suffix", () => {
    const c = classifyRepo("voting-wahlvorschlag-service");
    expect(c.domain).toBe("wahlvorschlag");
    expect(c.type).toBe("service");
  });
});
