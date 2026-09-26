import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, realpath, rename, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const defaultKey = 'leadflow-dev-only-encryption-key-0001';
const managed = ['ENCRYPTION_KEY', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_ORIGIN', 'NODE_ENV'];
const newSecret = () => randomBytes(32).toString('hex');
export function planConfiguration(current) {
  const next = { ...current };
  if (!next.ENCRYPTION_KEY || next.ENCRYPTION_KEY === defaultKey) next.ENCRYPTION_KEY = newSecret();
  else if (next.ENCRYPTION_KEY.length < 32) throw new Error('Existing encryption key is too short. Restore the original private key before continuing.');
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!next[key] || next[key].length < 16 || next[key].startsWith('change-me')) next[key] = newSecret();
  }
  if (next.JWT_ACCESS_SECRET === next.JWT_REFRESH_SECRET) next.JWT_REFRESH_SECRET = newSecret();
  next.NODE_ENV = 'production';
  next.CLIENT_ORIGIN = 'https://leads.mzistudio.com';
  return next;
}

async function main() {
  const root = await realpath(process.cwd());
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (manifest.name !== 'leadflow-server') throw new Error('Run this from the leadflow-server application directory.');
  const envPath = path.join(root, '.env');
  const original = await readFile(envPath, 'utf8');
  const current = dotenv.parse(original);
  // cPanel environment variables take precedence over dotenv. Never silently
  // rotate a private key supplied through that environment.
  const effective = { ...current };
  for (const key of managed) if (process.env[key] !== undefined) effective[key] = process.env[key];
  const next = planConfiguration(effective);
  const conflicts = managed.filter(key => process.env[key] !== undefined && process.env[key] !== next[key]);
  if (conflicts.length) throw new Error('Remove these overriding variables from cPanel Environment Variables, save, open a fresh activated terminal, and rerun: ' + conflicts.join(', ') + '. Their replacements will be stored privately in .env.');
  const backupRoot = path.join(homedir(), '.leadflow-private-backups');
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  const resolvedBackup = await realpath(backupRoot);
  const relative = path.relative(root, resolvedBackup);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Private backup location must be outside the application directory.');
  await chmod(backupRoot, 0o700);
  const backup = path.join(backupRoot, randomUUID() + '.env');
  await writeFile(backup, original, { flag: 'wx', mode: 0o600 });
  // Preserve every unrelated setting and comment verbatim; replace managed
  // assignments, including duplicate assignments, without printing values.
  let updated = original;
  for (const key of managed) {
    updated = updated.replace(new RegExp('^(?:export\\s+)?' + key + '\\s*=[^\\r\\n]*(?:\\r?\\n|$)', 'gm'), '');
  }
  updated = updated.trimEnd() + '\n\n# Production setup\n' + managed.map(key => key + '=' + JSON.stringify(next[key])).join('\n') + '\n';
  const temporary = path.join(root, '.env.setup-' + randomUUID());
  await writeFile(temporary, updated, { flag: 'wx', mode: 0o600 });
  await rename(temporary, envPath);
  console.log('Production configuration saved. Private backup: ' + backup);
  console.log('No secret values were printed. Database and provider settings were preserved. Restart the cPanel app.');
  if (next.ENCRYPTION_KEY !== effective.ENCRYPTION_KEY) console.log('Encryption key initialized: reconnect any integrations previously encrypted with the development key.');
  if (next.JWT_ACCESS_SECRET !== effective.JWT_ACCESS_SECRET || next.JWT_REFRESH_SECRET !== effective.JWT_REFRESH_SECRET) console.log('Signing configuration updated: users may need to sign in again.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('Setup failed: ' + error.message); process.exitCode = 1; });
}
