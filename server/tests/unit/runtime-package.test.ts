import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
it('produces an installable runtime manifest without the development peer graph',()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'leadflow-runtime-test-'));
 try {
  const output=path.join(temp,'package');
  const result=spawnSync(process.execPath,['scripts/prepare-runtime-package.mjs',output],{encoding:'utf8'});
  expect(result.status,result.stderr).toBe(0);
  const manifest=JSON.parse(readFileSync(path.join(output,'package.json'),'utf8'));
  const source=JSON.parse(readFileSync('package.json','utf8'));
  const lock=JSON.parse(readFileSync(path.join(output,'package-lock.json'),'utf8'));
  expect(manifest.dependencies).toEqual(source.dependencies);
  expect(manifest.devDependencies).toBeUndefined();
  expect(manifest.scripts.start).toBe(source.scripts.start);
  expect(manifest.scripts.build).toBeUndefined();
  expect(lock.packages[''].devDependencies).toBeUndefined();
  expect(Object.keys(lock.packages).some(p=>/(^|\/)node_modules\/(vitest|vite|@vitest\/)/.test(p))).toBe(false);
  const again=spawnSync(process.execPath,['scripts/prepare-runtime-package.mjs',output],{encoding:'utf8'});
  expect(again.status).toBe(1);
 } finally { if(path.resolve(temp).startsWith(path.join(tmpdir(),'leadflow-runtime-test-'))) rmSync(temp,{recursive:true,force:true}); }
});
