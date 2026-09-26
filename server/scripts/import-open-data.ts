// Compatibility entry point for older instructions. Prefer the plain Node CLI.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const besideSource = fileURLToPath(new URL('./import-open-data.mjs', import.meta.url));
const besideBuild = fileURLToPath(new URL('../../scripts/import-open-data.mjs', import.meta.url));
const result = spawnSync(process.execPath, [existsSync(besideSource) ? besideSource : besideBuild, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) console.error('Import failed: ' + result.error.message);
process.exitCode = result.status ?? 1;
