import('./dist/src/index.js').catch(error => { console.error('[leadflow startup]', error); process.exitCode = 1; });
