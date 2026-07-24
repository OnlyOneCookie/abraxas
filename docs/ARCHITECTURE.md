# How this is put together

Quick notes for myself (and anyone peeking) on *why* things look the way they do.

## Site

Astro for static HTML, React only where I need it (graph, package table, search, security toggle). Keeps the pages light.

- **Project links** → Cytoscape graph  
- **Architecture** → plain CSS grid  
- **Deep-dive flows** → Mermaid sequence diagrams turned into SVG at build time (no Mermaid in the browser)

## Scanning packages

I don’t run `npm ci` / `dotnet restore` in the default pipeline. A lot of their packages live on private feeds I don’t have, and lockfiles aren’t always there publicly.

So I only scan **direct** public third-party deps from manifests. NuGet versions that are `$(SomeProp)` get resolved through `Directory.Build.props` / `config/*.props` when I can. Stuff under `@abraxas/*` and `Voting.*` is first-party and skipped for OSV.

Scores come from OSV (CVSS v3 / v4 vectors). Transitive mode exists behind a flag but needs registry tokens I don’t have.

If a `.csproj` already warns on `NU1902` / `NU1903`, I surface that as “they turn on NuGet audit”.

## Collecting the org

GitHub API for metadata, shallow clones for the actual files. Submodules are best-effort. Broken proto imports shouldn’t kill the whole run.

## Hosting

Pages from `onlyonecookie/abraxas-labs-explorer`. Data still comes from public `abraxas-labs`. Unofficial on purpose.

## Three things I keep separate in the UI

1. **Project links** — repo A depends on repo B  
2. **Packages** — third-party libraries a repo declares  
3. **Vulnerabilities** — whatever OSV actually returned for those versions (I don’t invent CVEs)
