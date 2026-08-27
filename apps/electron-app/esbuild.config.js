import { build } from 'esbuild';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const isDev = process.argv.includes('--dev');

async function main() {
  // Build main process with TypeScript
  console.log('Building main process...');
  execSync('tsc -p tsconfig.main.json', { stdio: 'inherit' });

  // Build preload with esbuild - mark electron as external to avoid bundling issues
  console.log('Building preload...');
  await build({
    entryPoints: ['src/preload/index.ts'],
    bundle: true,
    outfile: 'dist/preload/index.js',
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    logLevel: 'info',
  });

  // Build renderer with esbuild
  console.log('Building renderer...');
  const rendererBuild = await build({
    entryPoints: ['src/renderer/main.ts'],
    bundle: true,
    outdir: 'dist/renderer',
    format: 'iife',
    target: 'es2022',
    sourcemap: isDev ? 'inline' : false,
    minify: !isDev,
    logLevel: 'info',
  });

  // Copy HTML file manually (esbuild doesn't copy non-JS assets by default)
  const srcHtml = path.join('src', 'renderer', 'index.html');
  const destHtml = path.join('dist', 'renderer', 'index.html');
  fs.copyFileSync(srcHtml, destHtml);

  // Copy styles directory
  const srcStyles = path.join('src', 'renderer', 'styles');
  const destStyles = path.join('dist', 'renderer', 'styles');
  
  if (!fs.existsSync(destStyles)) {
    fs.mkdirSync(destStyles, { recursive: true });
  }
  
  const styleFiles = fs.readdirSync(srcStyles);
  for (const file of styleFiles) {
    fs.copyFileSync(path.join(srcStyles, file), path.join(destStyles, file));
  }

  console.log('Build complete!');
  if (rendererBuild.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
