import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2020",
  // Peer deps must never be bundled — the consuming app owns the React and
  // TanStack Query instances (two copies of either breaks hooks/context).
  external: ["react", "react-dom", "@tanstack/react-query"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
