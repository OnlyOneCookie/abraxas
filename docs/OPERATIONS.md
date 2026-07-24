# Running / deploying

Repo that hosts the site: `OnlyOneCookie/abraxas` (private).  
Org I scrape: public `abraxas-labs`. That’s it.

## When the pipeline runs

| Trigger | What happens |
|---------|----------------|
| Nightly ~02:00 UTC | Re-collect org, OSV scan, write `data.json`, commit it, build, deploy Pages |
| Manual “Run workflow” / sidebar refresh link | Same as nightly |
| Push to `master` | Rebuild the site from the committed `data.json` (skips if the push was only `data/**` from the bot) |

## Env knobs (optional)

By default only `GITHUB_TOKEN` — enough for public org stuff.

Repo variables if you want them:

- `VULN_SCAN_ENABLED` (default on)
- `VULN_SCAN_MODE` — `direct` or `transitive`
- `VULN_SCANNER` — usually `osv`
- `VULN_SCAN_REQUIRED` — leave false so a flaky scan doesn’t fail the whole job

## Pages + private repos

Private repo + Pages = GitHub Pro, or make the repo public. Workflows still update `data.json` either way.

## Commands I actually use

```bash
pnpm install
pnpm pipeline:fixtures -- --skip-vuln
pnpm pipeline
pnpm dev
pnpm build:web
pnpm test
```

## First push

Already on GitHub as `OnlyOneCookie/abraxas`. To refresh Pages after config changes:

```bash
git add -A && git commit -m "fix pages base for OnlyOneCookie/abraxas" && git push
gh workflow run rebuild.yml
```
