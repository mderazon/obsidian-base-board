import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

const banner = `/**
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 */`;

const opts = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  sourcemap: true,
  target: "ES2020",
  format: "esm",
  banner: { js: banner },
};

const production = process.argv.includes("production");

if (production) {
  await esbuild.build({
    ...opts,
    outfile: "dist/index.js",
    minify: true,
  });

  // CJS build for require() consumers
  await esbuild.build({
    ...opts,
    format: "cjs",
    outfile: "dist/index.cjs",
    banner: {},
  });

  console.log("board-core: production build complete");
} else {
  const ctx = await esbuild.context(opts);
  await ctx.rebuild();
  await ctx.watch();
  console.log("board-core: watching for changes...");
}
