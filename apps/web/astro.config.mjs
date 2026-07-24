import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { updateApiPlugin } from "./vite-update-api.ts";
import {
  EXPLORER_BASE,
  EXPLORER_SITE,
} from "./src/lib/site.ts";

// GitHub Pages serves under /abraxas/; local `astro dev` uses /
const isProdBuild = process.argv.includes("build");

export default defineConfig({
  output: "static",
  integrations: [react()],
  site: EXPLORER_SITE,
  base: isProdBuild ? EXPLORER_BASE : "/",
  vite: {
    plugins: isProdBuild ? [] : [updateApiPlugin()],
    ssr: {
      noExternal: ["cytoscape"],
    },
  },
});
