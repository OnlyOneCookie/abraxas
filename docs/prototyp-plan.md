# Notes while figuring out abraxas-labs

I wanted a map of their public GitHub org — mostly curiosity / prep, not because I work there. The org is pretty regular, which made automation realistic.

There’s an early single-file mock in [`prototyp.html`](prototyp.html). The real thing is the Astro app + pipeline in this repo.

## What’s in the org (public)

~34 public repos. Most of it is **VOTING** (Swiss election / e-voting tooling), plus a bit of **PER** and one terraform module. Tagline on the org: *„Für die digitale Schweiz. Mit Sicherheit.“*

Naming is consistent enough to classify automatically. Domains usually show up as:

| Suffix | Role | Typical stack |
|--------|------|----------------|
| `-service` | backend | .NET, gRPC |
| `-webapp` | frontend | Angular |
| `-proto` | contracts | protobuf / npm+nuget packages |
| `-docs` | docs | separate repo per domain |

Domains I’ve seen: Basis, Stimmregister, Ausmittlung, Wahlvorschlag, Stimmunterlagen Online / Offline, E-Collecting. Shared libs: `voting-library-dotnet`, `voting-library-angular`, `voting-library-validation-proto`.

READMEs are thin (they point at `-docs`). The interesting stuff is in manifests, protos, changelogs, and the docs repos — that’s what the pipeline reads.

## What I wanted out of the site

- What exists and what each domain is for  
- How repos wire to each other (versions when I can resolve them)  
- Third-party packages + OSV/CVSS for the versions they declare  
- A “security” toggle for the integrity-sensitive bits (counting, voter register, e-collecting, OTP, etc.)  
- Deep dives where the docs/protos are good enough (Ausmittlung was the first real one)

## Project links vs packages vs vulns

I kept messing these up early on, so the UI treats them as different things:

- **Project links** — repo → repo  
- **Packages** — npm / NuGet deps  
- **Vulnerabilities** — OSV hits on those package versions (CVSS, not some internal “CCVS” catalog — that was a misunderstanding)

Direct deps only by default. Full transitive would mean restores against private feeds I don’t have.

## Pipeline shape

Nightly (and manual) Action: collect → analyze → `data.json` → build → Pages. Locally I can hit “Update now” and re-run the collector. On Pages I just kick the workflow.

## Random Ausmittlung takeaways (from public sources)

Event-sourced .NET service, gRPC, events signed via PKCS#11/HSM, OTP on sensitive steps, Erfassung + Monitoring Angular apps. Docs repo has the architecture PDFs. There’s a public bug-bounty / exclusions list in their docs.

I only show CVEs that OSV actually returned — no fake severities in the live site.
