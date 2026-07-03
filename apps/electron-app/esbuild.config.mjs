import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

const production = process.argv.includes("production");

// Main process bundle
await esbuild.build({
  entryPoints: ["main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "main.js",
  target: "node18",
  sourcemap: !production,
  external: ["electron"],
});

// Renderer bundle (browser platform)
await esbuild.build({
  entryPoints: ["renderer/main.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: "renderer/main.js",
  target: "es2020",
  sourcemap: !production,
});

console.log("electron-app: build complete");
