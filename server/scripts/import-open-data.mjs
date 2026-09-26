import { open, mkdir, link, unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const usage = 'Usage: node scripts/import-open-data.mjs INPUT.jsonl OUTPUT.jsonl\nINPUT must be an existing OSM JSONL export. This command validates a file; it does not download businesses.';

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(usage); return; }
  if (args.length !== 2) throw new Error(usage);
  const [input, output] = args.map(value => path.resolve(value));
  if (args.some(value => /(^|[\\/])path[\\/]to[\\/]/i.test(value))) {
    throw new Error('"path/to/..." is a documentation placeholder. Upload a real OSM JSONL export and pass its actual path.\n' + usage);
  }
  if (input === output) throw new Error('Input and output must be different files.');

  let source;
  try { source = await open(input, 'r'); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Input file not found: ${input}\nUpload your export first, then use its actual filename. No output was created.`);
    throw error;
  }
  let target, temporary, reader, stream;
  try {
    const info = await source.stat();
    if (!info.isFile()) throw new Error('Input must be a regular JSONL file.');
    if (info.size > 100_000_000) throw new Error('Input exceeds 100 MB. Split the export by region first.');
    let normalizeOsm;
    try { ({ normalizeOsm } = await import('../dist/src/lib/discovery/osm.js')); }
    catch { throw new Error('The compiled OSM adapter is missing. Build the server locally with npm run build and upload dist/ before importing.'); }
    await mkdir(path.dirname(output), { recursive: true });
    const temporaryPath = path.join(path.dirname(output), `.leadflow-import-${randomUUID()}.tmp`);
    target = await open(temporaryPath, 'wx');
    temporary = temporaryPath;
    stream = source.createReadStream({ encoding: 'utf8', autoClose: false });
    reader = createInterface({ input: stream, crlfDelay: Infinity });
    stream.on('error', error => reader.emit('error', error));
    let count = 0, rejected = 0, bytes = 0;
    for await (const line of reader) {
      bytes += Buffer.byteLength(line) + 1;
      if (bytes > 100_000_000) throw new Error('Input exceeds the 100 MB limit.');
      if (!line.trim()) continue;
      let record;
      try { record = JSON.parse(line); } catch { rejected++; continue; }
      if (!normalizeOsm(record)) { rejected++; continue; }
      await target.writeFile(JSON.stringify(record) + '\n');
      count++;
    }
    if (!count) throw new Error(`No valid OSM elements found (${rejected} rejected). Expected one original OSM element per line. No output was published.`);
    await target.close(); target = undefined;
    // Publish only after validation, atomically refusing an existing destination.
    try { await link(temporary, output); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error(`Output already exists: ${output}. Choose a different output filename; existing data was not changed.`);
      throw error;
    }
    console.log(`Validated ${count} OpenStreetMap elements; rejected ${rejected}.`);
    console.log(`Set OPEN_DATA_FILE=${output} in the API and worker environments, then restart them.`);
  } finally {
    reader?.close(); stream?.destroy();
    await target?.close();
    await source.close();
    if (temporary) await unlink(temporary).catch(() => {});
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error('Import failed: ' + error.message);
  process.exitCode = 1;
});
