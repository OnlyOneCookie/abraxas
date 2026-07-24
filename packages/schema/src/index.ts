import { z } from "zod";

export const RepoTypeSchema = z.enum([
  "service",
  "webapp",
  "proto",
  "docs",
  "library",
  "app",
  "infra",
  "external",
  "unclassified",
]);

export const EcosystemSchema = z.enum(["npm", "nuget"]);

export const VersionSourceSchema = z.enum([
  "package.json",
  "csproj",
  "msbuild-props",
  "central-unresolved",
  "directory-packages",
]);

export const PackageScopeSchema = z.enum(["third-party", "first-party"]);

export const GlossaryEntrySchema = z.object({
  term: z.string(),
  gloss: z.string(),
});

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  domains: z.array(z.string()),
});

export const DomainCoverageSchema = z.object({
  hasProto: z.boolean(),
  hasDocs: z.boolean(),
  hasChangelog: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const DomainSchema = z.object({
  id: z.string(),
  product: z.string(),
  title: z.string(),
  purpose: z.string(),
  securityCritical: z.boolean(),
  repos: z.array(z.string()),
  coverage: DomainCoverageSchema,
});

export const ProjectLinkSchema = z.object({
  sourceRepo: z.string(),
  targetRepo: z.string(),
  version: z.string().nullable(),
  kind: z.enum([
    "proto",
    "shared-lib",
    "external",
    "validation",
    "integration",
    "domain",
    "lib",
    "submodule",
  ]),
  source: z.string(),
});

export const NugetAuditSchema = z.object({
  enabled: z.boolean(),
  evidence: z.string().optional(),
});

export const RepoHealthSchema = z.object({
  clone: z.enum(["ok", "failed"]).default("ok"),
  submodules: z.enum(["ok", "partial", "skipped", "none"]).default("none"),
  restore: z.enum(["ok", "failed", "skipped"]).default("skipped"),
  error: z.string().optional(),
});

export const RepoSecuritySchema = z.object({
  critical: z.boolean(),
  notes: z.array(z.string()),
});

export const RepoSchema = z.object({
  name: z.string(),
  product: z.string(),
  domain: z.string(),
  type: RepoTypeSchema,
  language: z.string(),
  description: z.string(),
  lastPush: z.string().nullable(),
  stars: z.number().nullable(),
  forks: z.number().nullable(),
  url: z.string(),
  docsUrl: z.string().nullable(),
  changelogUrl: z.string().nullable(),
  version: z.string().nullable(),
  security: RepoSecuritySchema,
  health: RepoHealthSchema.optional(),
  nugetAudit: NugetAuditSchema.optional(),
  topics: z.array(z.string()).default([]),
});

export const PackageEntrySchema = z.object({
  repo: z.string(),
  ecosystem: EcosystemSchema,
  name: z.string(),
  declaredVersion: z.string().nullable(),
  msbuildProperty: z.string().nullable().optional(),
  installedVersion: z.string().nullable(),
  direct: z.boolean(),
  transitive: z.boolean(),
  scope: PackageScopeSchema,
  osvEligible: z.boolean(),
  versionSource: VersionSourceSchema,
  dev: z.boolean().default(false),
});

/** One CVSS metric from OSV (v3.x or v4.0). */
export const CvssMetricSchema = z.object({
  version: z.string(),
  score: z.number().nullable(),
  vector: z.string(),
});

export const VulnerabilitySchema = z.object({
  id: z.string().regex(/^(CVE|GHSA|OSV)-/i),
  aliases: z.array(z.string()).default([]),
  package: z.object({
    ecosystem: EcosystemSchema,
    name: z.string(),
    installedVersion: z.string(),
  }),
  repos: z.array(z.string()),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  /** Preferred score for sorting: v4 then v3. */
  cvssScore: z.number().nullable(),
  cvssV3: CvssMetricSchema.nullable().default(null),
  cvssV4: CvssMetricSchema.nullable().default(null),
  summary: z.string(),
  fixedIn: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
  source: z.string(),
});

export const ProtoMethodSchema = z.object({
  name: z.string(),
  request: z.string(),
  response: z.string(),
});

export const ProtoServiceSchema = z.object({
  name: z.string(),
  methods: z.array(ProtoMethodSchema),
});

export const ApiSurfaceSchema = z.object({
  source: z.enum(["proto", "unavailable", "service-inferred"]),
  services: z.array(ProtoServiceSchema).default([]),
  unresolvedImports: z
    .array(
      z.object({
        import: z.string(),
        status: z.enum(["unavailable", "external"]),
      }),
    )
    .default([]),
});

export const DataModelGroupSchema = z.object({
  title: z.string(),
  messages: z.array(z.string()),
});

export const DataModelSchema = z.object({
  source: z.enum(["proto-messages", "unavailable"]),
  groups: z.array(DataModelGroupSchema).default([]),
});

export const FlowSchema = z.object({
  kind: z.literal("heuristic"),
  disclaimer: z.string(),
  mermaid: z.string(),
  svgPath: z.string().optional(),
});

export const SecurityNoteSchema = z.object({
  text: z.string(),
  kind: z.literal("heuristic"),
  evidence: z.array(z.string()),
});

export const DocLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
  format: z.enum(["pdf", "md", "other"]),
});

export const DeepDiveAppSchema = z.object({
  name: z.string(),
  role: z.string(),
  port: z.number().nullable().optional(),
});

export const DeepDiveSchema = z.object({
  provenance: z.literal("auto"),
  apps: z.array(DeepDiveAppSchema).default([]),
  stack: z
    .object({
      backend: z.array(z.string()).default([]),
      frontend: z.array(z.string()).default([]),
      contracts: z.array(z.string()).default([]),
    })
    .default({ backend: [], frontend: [], contracts: [] }),
  apiSurface: ApiSurfaceSchema,
  dataModel: DataModelSchema,
  flow: FlowSchema,
  securityNotes: z.array(SecurityNoteSchema).default([]),
  docs: z.array(DocLinkSchema).default([]),
});

export const VulnScanMetaSchema = z.object({
  enabled: z.boolean(),
  scanner: z.enum(["osv", "github", "trivy", "grype", "noop"]).optional(),
  mode: z.enum(["direct", "transitive"]).optional(),
  coverageNote: z.string().optional(),
  scannedAt: z.string().optional(),
  reason: z.string().optional(),
});

export const MetaSchema = z.object({
  org: z.string(),
  pipelineVersion: z.string(),
  triggers: z.array(z.string()),
  vulnScan: VulnScanMetaSchema,
  coverage: z.object({
    repos: z.number(),
    classified: z.number(),
    unclassified: z.number(),
  }),
});

export const ExplorerDataSchema = z.object({
  generatedAt: z.string(),
  meta: MetaSchema,
  glossary: z.array(GlossaryEntrySchema),
  products: z.array(ProductSchema),
  domains: z.array(DomainSchema),
  repos: z.array(RepoSchema),
  projectLinks: z.array(ProjectLinkSchema),
  packages: z.array(PackageEntrySchema),
  vulnerabilities: z.array(VulnerabilitySchema),
  deepDives: z.record(z.string(), DeepDiveSchema),
});

export type ExplorerData = z.infer<typeof ExplorerDataSchema>;
export type Repo = z.infer<typeof RepoSchema>;
export type Domain = z.infer<typeof DomainSchema>;
export type PackageEntry = z.infer<typeof PackageEntrySchema>;
export type Vulnerability = z.infer<typeof VulnerabilitySchema>;
export type CvssMetric = z.infer<typeof CvssMetricSchema>;
export type ProjectLink = z.infer<typeof ProjectLinkSchema>;
export type DeepDive = z.infer<typeof DeepDiveSchema>;
export type RepoType = z.infer<typeof RepoTypeSchema>;
export type ApiSurface = z.infer<typeof ApiSurfaceSchema>;
export type DataModel = z.infer<typeof DataModelSchema>;
export type DocLink = z.infer<typeof DocLinkSchema>;

export function parseExplorerData(input: unknown): ExplorerData {
  return ExplorerDataSchema.parse(input);
}

export function assertNoFabricatedVulns(
  vulns: Vulnerability[],
  allowedIds: Set<string>,
): void {
  for (const v of vulns) {
    if (!allowedIds.has(v.id)) {
      throw new Error(
        `Integrity violation: vulnerability id ${v.id} not present in scanner output`,
      );
    }
  }
}
