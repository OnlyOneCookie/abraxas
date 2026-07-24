# Abraxas Labs Explorer

I built this to get my head around the public [`abraxas-labs`](https://github.com/abraxas-labs) org — how the voting products hang together, which repos talk to which, what third-party packages they pull in, and whether OSV knows about anything nasty in those versions.

It's **my** private project under [`onlyonecookie/abraxas-labs-explorer`](https://github.com/onlyonecookie/abraxas-labs-explorer). Not an Abraxas thing, not affiliated with them. I only look at public repos.

## Run it locally

```bash
pnpm install
pnpm pipeline:fixtures   # tiny sample dataset
pnpm pipeline            # pull public abraxas-labs → data/data.json
pnpm dev                 # http://localhost:4321/
```

In local dev the sidebar “Update now” actually re-runs the pipeline. On GitHub Pages that button just opens Actions (static site can’t spawn the collector).

## Put it on GitHub Pages

1. Create a **private** repo named `abraxas-labs-explorer` on **your** account (`onlyonecookie`) — please don’t push this into `abraxas-labs`.
2. Push `main` (keep `data/data.json` in the commit).
3. Repo settings → Pages → source = **GitHub Actions**.
4. Actions → **Rebuild explorer** → Run workflow.

Then it should show up at:

`https://onlyonecookie.github.io/abraxas-labs-explorer/`

Free GitHub only does Pages for public repos. Private Pages needs Pro. Either way the workflow can still refresh `data.json` in the private repo.

Nightly cron + “Refresh via Actions” keep the snapshot current; the workflow commits `data/data.json` back so your clone doesn’t go stale.

## Layout of this repo

| Path | What it is |
|------|------------|
| `apps/web` | Astro site |
| `packages/schema` | shape of `data.json` |
| `packages/pipeline` | clone org → parse → OSV → write `data.json` |
| `docs/` | notes on how/why |

More detail: [how it’s put together](docs/ARCHITECTURE.md) · [how I run/deploy it](docs/OPERATIONS.md)
