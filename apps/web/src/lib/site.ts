/** My GitHub account + this explorer repo (not the org we scrape). */
export const EXPLORER_OWNER = "OnlyOneCookie";
export const EXPLORER_REPO = "abraxas";
export const EXPLORER_SITE = `https://onlyonecookie.github.io`;
/** Must end with `/` so `${base}packages/` → `/abraxas/packages/` not `/abraxaspackages/`. */
export const EXPLORER_BASE = `/${EXPLORER_REPO}/`;
export const EXPLORER_GITHUB = `https://github.com/${EXPLORER_OWNER}/${EXPLORER_REPO}`;
export const EXPLORER_ACTIONS_WORKFLOW = `${EXPLORER_GITHUB}/actions/workflows/rebuild.yml`;

/** Public org the pipeline clones. */
export const SOURCE_ORG = "abraxas-labs";

/** Join a path onto the site base (works in prod `/abraxas/` and local `/`). */
export function withBase(path = ""): string {
  const root = import.meta.env.BASE_URL;
  const base = root.endsWith("/") ? root : `${root}/`;
  const rel = path.replace(/^\//, "");
  return `${base}${rel}`;
}
