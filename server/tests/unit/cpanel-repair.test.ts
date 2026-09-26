import { spawnSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect,it } from 'vitest';
it('removes deployment test dependencies, preserves Passenger configuration, and backs up original files',()=>{
 const base=mkdtempSync(path.join(tmpdir(),'leadflow-cpanel-test-'));const root=path.join(base,'app');mkdirSync(root);
 try {
  writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'leadflow-server',type:'module',dependencies:{express:'^4.19.2'},devDependencies:{vitest:'^4.1.11'},scripts:{start:'node dist/src/index.js',test:'vitest'}}));
  writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({lockfileVersion:3,packages:{'':{devDependencies:{vitest:'^4.1.11'}},'node_modules/vitest':{dev:true},'node_modules/express':{version:'4.21.2'}}}));
  writeFileSync(path.join(root,'.htaccess'),'PassengerAppRoot /existing/root\nPassengerNodejs /existing/node\n');
  const script=path.resolve('scripts/repair-cpanel.mjs');
  const run=()=>spawnSync(process.execPath,[script,root,path.join(base,'backups')],{encoding:'utf8'});
  const result=run();expect(result.status,result.stderr).toBe(0);
  expect(JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).devDependencies).toBeUndefined();
  const access=readFileSync(path.join(root,'.htaccess'),'utf8');
  expect(access).toContain('PassengerAppRoot /existing/root');expect(access).toContain('Options -Indexes');
  expect(access).toContain('Require all denied');expect(result.stdout).toContain('Backup:');
  expect(run().status).toBe(0);expect(readFileSync(path.join(root,'.htaccess'),'utf8').match(/BEGIN LEADFLOW PROTECTION/g)).toHaveLength(1);
 } finally {if(path.resolve(base).startsWith(path.join(tmpdir(),'leadflow-cpanel-test-')))rmSync(base,{recursive:true,force:true});}
});
