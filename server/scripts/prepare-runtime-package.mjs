import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep development dependencies in the source project. A prebuilt deployment
// gets its own manifest so npm never resolves the test-only peer graph there.
async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-runtime-package.mjs NEW_OUTPUT_DIRECTORY');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const manifest = { ...source };
  delete manifest.devDependencies;
  manifest.scripts = Object.fromEntries(Object.entries(source.scripts).filter(([key]) => ['start', 'start:prod', 'migrate', 'data:import'].includes(key)));
  lock.packages = Object.fromEntries(Object.entries(lock.packages).filter(([name, entry]) => !name || entry.dev !== true));
  delete lock.packages[''].devDependencies;
  const output = path.resolve(process.argv[2]);
  // Never replace the source project or an existing deployment directory.
  await mkdir(output);
  await writeFile(path.join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  await writeFile(path.join(output, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
  console.log(`Runtime manifests created at ${output}. Validate installation there before uploading; deploy prebuilt dist/ separately.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
