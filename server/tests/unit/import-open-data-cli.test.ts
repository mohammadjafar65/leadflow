import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
const directories:string[]=[];
function directory(){const dir=mkdtempSync(path.join(tmpdir(),'leadflow-import-test-'));directories.push(dir);return dir;}
afterEach(()=>{for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});
const run=(args:string[])=>spawnSync(process.execPath,['scripts/import-open-data.mjs',...args],{encoding:'utf8'});
it('explains example paths without creating output or printing a stack trace',()=>{
 const output=path.join(directory(),'businesses.jsonl');const result=run(['path/to/export.jsonl',output]);
 expect(result.status).toBe(1);expect(result.stderr).toContain('placeholder');
 expect(result.stderr).not.toContain('triggerUncaughtException');expect(existsSync(output)).toBe(false);
});
it('reports a missing real input file cleanly before creating output',()=>{
 const dir=directory();const result=run([path.join(dir,'missing.jsonl'),path.join(dir,'businesses.jsonl')]);
 expect(result.status).toBe(1);expect(result.stderr).toContain('Input file not found');expect(existsSync(path.join(dir,'businesses.jsonl'))).toBe(false);
});
it('imports source records with plain Node and refuses to overwrite an existing file',()=>{
 const dir=directory(),input=path.join(dir,'export.jsonl'),output=path.join(dir,'data','businesses.jsonl');
 const record={type:'node',id:123,lat:1,lon:2,tags:{name:'Test fixture cafe',amenity:'cafe'}};
 writeFileSync(input,JSON.stringify(record)+'\ninvalid\n');
 const first=run([input,output]);expect(first.stderr).toBe('');expect(first.status).toBe(0);
 expect(first.stdout).toContain('Validated 1');expect(JSON.parse(readFileSync(output,'utf8'))).toEqual(record);
 const second=run([input,output]);expect(second.status).toBe(1);expect(second.stderr).toContain('already exists');
 expect(JSON.parse(readFileSync(output,'utf8'))).toEqual(record);
});
it('does not publish an empty extract when all records are invalid',()=>{
 const dir=directory(),input=path.join(dir,'export.jsonl'),output=path.join(dir,'businesses.jsonl');writeFileSync(input,'{}\n');
 const result=run([input,output]);expect(result.status).toBe(1);expect(result.stderr).toContain('No valid');expect(existsSync(output)).toBe(false);
});
