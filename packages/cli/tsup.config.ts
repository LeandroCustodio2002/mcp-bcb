import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  // O core não é publicado no npm: entra no bundle. O resto fica como dependência.
  noExternal: [/^@mcp-bcb\//],
  banner: { js: "#!/usr/bin/env node" },
});
