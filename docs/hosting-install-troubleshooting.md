# Hosting errors — 26 September 2026

## Missing input file

The screenshot runs `npx tsx scripts/import-open-data.ts path/to/export.jsonl path/to/businesses.jsonl`. `path/to/export.jsonl` was a documentation placeholder, not an existing export. Installing `tsx` cannot create the missing data. The documentation was insufficiently explicit about this prerequisite.

The replacement importer is `server/scripts/import-open-data.mjs`. Upload it as `scripts/import-open-data.mjs` under the server app root, together with the compiled `dist/src/lib/discovery/osm.js` adapter. It uses plain Node; no npm installation is needed to run this importer. The patch ZIP contains these two files. Extract it **inside the server app root**, not the frontend directory. It does not contain credentials, dependencies or sample business data.

In your hosting terminal:

```bash
source /home/softoatk/nodevenv/mzistudio.com/leadflow-server/22/bin/activate
cd /home/softoatk/mzistudio.com/leadflow-server
node scripts/import-open-data.mjs --help
read -r -p "Full path to your uploaded OSM JSONL export: " OSM_INPUT
if [ -f "$OSM_INPUT" ]; then
  node scripts/import-open-data.mjs "$OSM_INPUT" "$PWD/data/businesses.jsonl"
else
  printf 'The export is missing. Upload a real OSM JSONL file first.\n'
fi
```

If no export exists, stop at this step: the importer cannot invent one. Obtain an original OSM business export containing one element per line, as described in production-readiness.md. An already-normalized lead list or a single Overpass response object is not that format.

On success, set the following server and worker environment value, then restart both:

```dotenv
OPEN_DATA_FILE=/home/softoatk/mzistudio.com/leadflow-server/data/businesses.jsonl
```

Missing files, example paths and wholly invalid input now produce a readable error with exit code 1, without publishing an output file. Valid imports preserve original OSM IDs/tags and report rejected lines. An existing output is never overwritten; choose a new filename to import an updated extract.

## npm `Cannot read properties of null (reading 'edgesOut')`

**Update after receiving the log:** the stack trace identifies Vitest development peer resolution inside npm's `#loadPeerSet`. A runtime-only manifest patch and instructions are now available in [cpanel-npm-fix.md](cpanel-npm-fix.md). The observations below record the earlier investigation.

This screenshot does not include the dependency resolver stack trace or npm version. Do not treat the missing export as the cause of this separate npm error. The same symptom has been reported in npm's dependency resolver ([npm issue #8261](https://github.com/npm/cli/issues/8261)), but that does not identify the cause on this host.

Run these read-only diagnostics in the activated hosting environment and share the output after redacting any credentials:

```bash
node -v
npm -v
tail -n 60 /home/softoatk/.npm/_logs/2026-09-25T19_55_41_577Z-debug-0.log
ls -ld node_modules
readlink node_modules
```

Do not delete the hosting environment's `node_modules` link or the lockfile as a speculative fix. CloudLinux uses an activated Node environment; its installation workflow is documented in [CloudLinux CLI documentation](https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/).

Local evidence: a fresh directory containing only `server/package.json` and `server/package-lock.json` completed `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` with 232 packages, Node 24.10.0 and npm 11.6.1 on Windows. That verifies the checked-in production dependency resolution in that environment, not the remote Linux/CloudLinux install or lifecycle scripts. No dependency versions were changed to guess at the remote failure. The exact hosting npm fix remains pending the actual debug-log contents.

The user subsequently confirmed hosting Node 22.23.2 and npm 10.9.8. A second isolated install explicitly using **npm 10.9.8** (`npm install --omit=dev --ignore-scripts --no-audit --no-fund`) also succeeded locally, installing 227 packages. Its runtime was still Windows/Node 24.10.0; the hosting-specific error remains unreproduced. A version change or forced dependency resolution is not yet justified by the available evidence.
