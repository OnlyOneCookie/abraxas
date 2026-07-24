import type { RepoType } from "@abraxas/schema";

export interface Classification {
  product: string;
  productName: string;
  domain: string;
  domainTitle: string;
  type: RepoType;
  purpose: string;
  securityCritical: boolean;
}

const DOMAIN_META: Record<
  string,
  { title: string; purpose: string; securityCritical: boolean; product: string }
> = {
  basis: {
    title: "Basis",
    purpose:
      "Base and master data, configuration, permissions. The foundation other domains build on.",
    securityCritical: true,
    product: "voting",
  },
  stimmregister: {
    title: "Stimmregister",
    purpose:
      "Voter register — including e-voting and citizen e-service variants.",
    securityCritical: true,
    product: "voting",
  },
  ausmittlung: {
    title: "Ausmittlung",
    purpose: "Vote counting and result tabulation. Integrity-critical.",
    securityCritical: true,
    product: "voting",
  },
  wahlvorschlag: {
    title: "Wahlvorschlag",
    purpose: "Candidate lists / electoral proposals.",
    securityCritical: false,
    product: "voting",
  },
  "su-online": {
    title: "Stimmunterlagen Online",
    purpose: "Voting materials, online generation and delivery.",
    securityCritical: false,
    product: "voting",
  },
  "su-offline": {
    title: "Stimmunterlagen Offline",
    purpose: "Offline client for producing voting materials.",
    securityCritical: false,
    product: "voting",
  },
  ecollecting: {
    title: "E-Collecting",
    purpose: "Digital signature collection for initiatives and referenda.",
    securityCritical: true,
    product: "voting",
  },
  shared: {
    title: "Shared libraries",
    purpose: "Cross-domain .NET and Angular libraries and validation contracts.",
    securityCritical: false,
    product: "voting",
  },
  per: {
    title: "PER Auskunft",
    purpose: "Person-register query product.",
    securityCritical: false,
    product: "per",
  },
  infra: {
    title: "Infrastructure",
    purpose: "Reusable infrastructure modules.",
    securityCritical: false,
    product: "infra",
  },
  unclassified: {
    title: "Unclassified",
    purpose: "Repository that does not match the naming convention.",
    securityCritical: false,
    product: "unclassified",
  },
};

const PRODUCT_NAMES: Record<string, string> = {
  voting: "VOTING",
  per: "PER",
  infra: "Infra",
  unclassified: "Other",
};

const TYPE_SUFFIXES: Array<{ suffix: string; type: RepoType }> = [
  { suffix: "-citizen-eservice", type: "service" },
  { suffix: "-client-shared", type: "library" },
  { suffix: "-client-app", type: "app" },
  { suffix: "-client-docs", type: "docs" },
  { suffix: "-eservice", type: "service" },
  { suffix: "-evoting", type: "service" },
  { suffix: "-service", type: "service" },
  { suffix: "-webapp", type: "webapp" },
  { suffix: "-proto", type: "proto" },
  { suffix: "-docs", type: "docs" },
];

function detectType(name: string): RepoType {
  if (name.startsWith("terraform-")) return "infra";
  if (name.includes("library-dotnet") || name.includes("library-angular")) {
    return "library";
  }
  if (name.includes("library-validation-proto")) return "proto";
  for (const { suffix, type } of TYPE_SUFFIXES) {
    if (name.endsWith(suffix)) return type;
  }
  return "unclassified";
}

function detectDomain(name: string): string {
  if (name.startsWith("terraform-")) return "infra";
  if (name.startsWith("voting-library")) return "shared";
  if (name.startsWith("per-auskunft") || name.startsWith("per-")) return "per";

  const withoutPrefix = name.replace(/^voting-/, "");
  if (withoutPrefix.startsWith("stimmunterlagen-online")) return "su-online";
  if (withoutPrefix.startsWith("stimmunterlagen-offline")) return "su-offline";
  if (withoutPrefix.startsWith("ausmittlung")) return "ausmittlung";
  if (withoutPrefix.startsWith("stimmregister")) return "stimmregister";
  if (withoutPrefix.startsWith("wahlvorschlag")) return "wahlvorschlag";
  if (withoutPrefix.startsWith("ecollecting")) return "ecollecting";
  if (withoutPrefix.startsWith("basis")) return "basis";

  return "unclassified";
}

export function classifyRepo(name: string): Classification {
  const domain = detectDomain(name);
  const type = detectType(name);
  const meta = DOMAIN_META[domain] ?? DOMAIN_META.unclassified!;
  const classifiedWell =
    domain !== "unclassified" && type !== "unclassified";

  return {
    product: meta.product,
    productName: PRODUCT_NAMES[meta.product] ?? "Other",
    domain,
    domainTitle: meta.title,
    type: classifiedWell || domain !== "unclassified" ? type : "unclassified",
    purpose: meta.purpose,
    securityCritical: meta.securityCritical && isSecurityRepo(name, type, domain),
  };
}

function isSecurityRepo(name: string, type: RepoType, domain: string): boolean {
  if (!DOMAIN_META[domain]?.securityCritical) return false;
  if (type === "docs") return false;
  if (
    name.includes("evoting") ||
    name.includes("eservice") ||
    name.includes("citizen") ||
    type === "service" ||
    type === "proto" ||
    type === "webapp"
  ) {
    return true;
  }
  if (name.includes("validation-proto")) return true;
  return DOMAIN_META[domain]?.securityCritical ?? false;
}

export function domainMeta(domainId: string) {
  return DOMAIN_META[domainId] ?? DOMAIN_META.unclassified!;
}

export function allKnownDomains(): string[] {
  return Object.keys(DOMAIN_META).filter((d) => d !== "unclassified");
}
