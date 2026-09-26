import { readFile, writeFile, mkdir, copyFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

async function optional(file) {
  try { return await readFile(file,'utf8'); } catch(error) { if(error.code==='ENOENT') return null; throw error; }
}
async function main() {
  const root=await realpath(path.resolve(process.argv[2]||process.cwd()));
  const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  if(manifest.name!=='leadflow-server') throw new Error('Refusing: run this in the leadflow-server application directory.');
  const backupRoot=path.resolve(process.argv[3]||path.join(homedir(),'.leadflow-repair-backups'));
  await mkdir(backupRoot,{recursive:true,mode:0o700});
  const resolvedBackup=await realpath(backupRoot);
  const relative=path.relative(root,resolvedBackup);
  if(relative==='' || (!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))) throw new Error('Backup directory must be outside the public app directory.');
  const backup=path.join(resolvedBackup,randomUUID());await mkdir(backup,{mode:0o700});
  const originals={};
  for(const name of ['package.json','package-lock.json','.htaccess','app.cjs']) {
    originals[name]=await optional(path.join(root,name));
    if(originals[name]!==null) await copyFile(path.join(root,name),path.join(backup,name));
  }
  console.log('Backup: '+backup);
  delete manifest.devDependencies;
  manifest.scripts=Object.fromEntries(Object.entries(manifest.scripts??{}).filter(([key])=>['start','start:prod','migrate','data:import'].includes(key)));
  await writeFile(path.join(root,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  if(originals['package-lock.json']) {
    const lock=JSON.parse(originals['package-lock.json']);
    if(lock.packages) {
      lock.packages=Object.fromEntries(Object.entries(lock.packages).filter(([name,entry])=>!name||entry.dev!==true));
      if(lock.packages['']) delete lock.packages[''].devDependencies;
      await writeFile(path.join(root,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
    } else console.log('Legacy lockfile retained; npm will update it during installation.');
  }
  // Preserve all cPanel-generated Passenger directives. Block static access to
  // server internals even when the Node application is stopped.
  const protection=`# BEGIN LEADFLOW PROTECTION
Options -Indexes
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule ^(?:dist|src|migrations|scripts|tests|scratch|tmp|node_modules|data|npm-manifests-backup[^/]*)(?:/|$) - [F,L,NC]
RewriteRule ^(?:package(?:-lock)?\\.json|app\\.(?:js|cjs)|repair-cpanel\\.mjs|deploy[^/]*\\.sh|tsconfig\\.json|vitest[^/]*|README[^/]*|leadflow[^/]*\\.zip)$ - [F,L,NC]
</IfModule>
<FilesMatch "^\\.">
Require all denied
</FilesMatch>
# END LEADFLOW PROTECTION`;
  const existing=originals['.htaccess']??'';
  const cleaned=existing.replace(/# BEGIN LEADFLOW PROTECTION[\s\S]*?# END LEADFLOW PROTECTION\s*/g,'');
  await writeFile(path.join(root,'.htaccess'),cleaned.trimEnd()+'\n\n'+protection+'\n');
  await writeFile(path.join(root,'app.cjs'),`// CommonJS Passenger entry point for the ESM application.\nimport('./dist/src/index.js').catch(error => { console.error('[leadflow startup]',error); process.exitCode=1; });\n`);
  console.log('Repair applied: development dependencies removed; file browsing blocked; existing Passenger settings preserved.');
  console.log('Next: npm install --omit=dev --legacy-peer-deps --no-audit --no-fund');
  console.log('Then set the cPanel startup file to app.cjs, save, and Start App.');
  console.log('No npm install, app restart, database migration or credential changes were performed by this script.');
}
main().catch(error=>{console.error('Repair failed: '+error.message);process.exitCode=1;});
