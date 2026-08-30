import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Static output: the deploy target is GitHub Pages behind Cloudflare, and every
// figure on the page is a pure function of the committed dataset plus the amount
// the reader types. Nothing here needs a server.
//
// `base` stays "/" because the site is served from an apex custom domain. Building
// against <user>.github.io/<repo> instead would break every asset path.
export default defineConfig({
  site: "https://whereismytaxmoney.com",
  output: "static",
  integrations: [react()],
  build: { format: "directory" },
});
