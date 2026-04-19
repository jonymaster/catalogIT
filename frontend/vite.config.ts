import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Hashed branding PNGs under /assets/ — preload so shell logo is ready early. */
const BRANDING_PRELOAD_PATTERN =
  /^assets\/(small-dark|transparent-dark|small-light|transparent-light)-[^/]+\.png$/;

function preloadBrandingImages(): Plugin {
  return {
    name: "preload-branding-images",
    apply: "build",
    enforce: "post",
    writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir;
      if (!outDir) return;

      const links: string[] = [];
      for (const fileName of Object.keys(bundle)) {
        if (!BRANDING_PRELOAD_PATTERN.test(fileName)) continue;
        links.push(`    <link rel="preload" as="image" href="/${fileName}" />`);
      }
      if (links.length === 0) return;

      links.sort();
      const indexPath = path.join(outDir, "index.html");
      let html = fs.readFileSync(indexPath, "utf8");
      if (html.includes('rel="preload" as="image"')) return;

      html = html.replace(
        /<meta charset="UTF-8" \/>/,
        `<meta charset="UTF-8" />\n${links.join("\n")}`,
      );
      fs.writeFileSync(indexPath, html, "utf8");
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadBrandingImages()],
  build: {
    manifest: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://api:8000",
      "/auth": "http://api:8000",
      "/scim": "http://api:8000",
      "/docs": "http://api:8000",
      "/openapi.json": "http://api:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
