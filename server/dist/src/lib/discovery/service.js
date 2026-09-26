import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash, randomUUID } from "node:crypto";
import { redis } from "../../db/redis.js";
import { env } from "../../config/env.js";
import { ApiError } from "../http.js";
import { fetchPublicText } from "../safe-fetch.js";
import { buildOverpassQuery, normalizeOsm, OSM_CATEGORIES } from "./osm.js";
export function discoveryStatus() {
    return { staging: false, hasApiKey: false, available: Boolean(env.OPEN_DATA_FILE || env.OVERPASS_URL), source: env.OPEN_DATA_FILE ? 'local_open_data' : 'openstreetmap', message: env.OPEN_DATA_FILE || env.OVERPASS_URL ? 'Open business data · no paid API' : 'Configure OPEN_DATA_FILE or a policy-compatible OVERPASS_URL to enable discovery.' };
}
const distance = (a, b, c, d) => { const rad = Math.PI / 180; const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 12742000 * Math.asin(Math.min(1, Math.sqrt(x))); };
async function localSearch(params) {
    const stream = createReadStream(env.OPEN_DATA_FILE, { encoding: 'utf8' });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    stream.on('error', error => lines.emit('error', error));
    const records = [];
    const seen = new Set();
    let bytes = 0;
    try {
        for await (const line of lines) {
            bytes += Buffer.byteLength(line);
            if (bytes > 100_000_000)
                throw new ApiError(413, 'Local extract exceeds 100 MB; partition it by region.');
            if (!line.trim())
                continue;
            const record = normalizeOsm(JSON.parse(line));
            if (!record || !record.category || !params.categories.includes(record.category) || seen.has(record.id))
                continue;
            const region = params.region;
            const matches = region.type === 'radius' && region.center ? distance(region.center.lat, region.center.lng, record.lat, record.lng) <= (region.radiusMeters ?? 5000)
                : (region.query ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean).every(term => record.address.toLowerCase().includes(term));
            if (matches) {
                records.push(record);
                seen.add(record.id);
            }
            if (records.length >= 500)
                break;
        }
    }
    finally {
        lines.close();
        stream.destroy();
    }
    return records;
}
async function remoteSearch(params) {
    if (!env.OVERPASS_URL)
        throw new ApiError(503, discoveryStatus().message);
    const cooldown = await redis.ttl('discovery:cooldown');
    if (cooldown > 0)
        throw new ApiError(429, `Source cooling down; retry in ${cooldown}s`);
    const token = randomUUID();
    const acquired = await redis.set('discovery:lock', token, 'EX', 300, 'NX');
    if (!acquired)
        throw new ApiError(429, 'Another source request is running. Please retry shortly.');
    try {
        const budget = Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],90000) end; return n", 1, `discovery:daily:${new Date().toISOString().slice(0, 10)}`));
        if (budget > env.OPEN_DATA_DAILY_QUERIES)
            throw new ApiError(429, 'Shared daily open-data request budget reached');
        let center = params.region.center;
        if (!center) {
            if (!env.GEOCODER_URL)
                throw new ApiError(422, 'Choose latitude/longitude search, or configure a compatible geocoder for city search.');
            const u = new URL(env.GEOCODER_URL);
            u.searchParams.set('q', params.region.query ?? '');
            u.searchParams.set('format', 'json');
            u.searchParams.set('limit', '2');
            const response = await fetchPublicText(u.href, { maxBytes: 100000 });
            if (response.status !== 200)
                throw new ApiError(503, 'Location service is unavailable. Use coordinates.');
            const matches = JSON.parse(response.text);
            if (matches.length !== 1)
                throw new ApiError(422, matches.length ? 'Location is ambiguous. Add country/region or use coordinates.' : 'Location not found. Use coordinates.');
            center = { lat: Number(matches[0].lat), lng: Number(matches[0].lon) };
        }
        const query = buildOverpassQuery(params.categories, center, params.region.radiusMeters ?? 5000);
        const bytesKey = `discovery:bytes:${new Date().toISOString().slice(0, 10)}`;
        const used = Number(await redis.get(bytesKey) ?? 0);
        const allowance = Math.min(5_000_000, 10_000_000 - used);
        if (allowance <= 0)
            throw new ApiError(429, 'Shared daily open-data download budget reached');
        // Reserve before fetching, retaining the reservation if a request is interrupted.
        await redis.incrby(bytesKey, allowance);
        await redis.expire(bytesKey, 90000);
        const response = await fetchPublicText(env.OVERPASS_URL, { method: 'POST', body: new URLSearchParams({ data: query }).toString(), maxBytes: allowance, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        await redis.incrby(bytesKey, Buffer.byteLength(response.text) - allowance);
        if (response.status === 429 || response.status === 406) {
            const numeric = Number(response.retryAfter);
            const delay = Number.isFinite(numeric) && numeric > 0 ? numeric : 60;
            await redis.set('discovery:cooldown', '1', 'EX', Math.min(86400, Math.max(30, delay)));
            throw new ApiError(429, 'Open-data source rate limited this request. It has been paused.');
        }
        if (response.status !== 200)
            throw new ApiError(503, `Open-data source unavailable (${response.status})`);
        const data = JSON.parse(response.text);
        if (data.remark || !Array.isArray(data.elements))
            throw new ApiError(503, 'Source query was incomplete. Narrow the search and retry.');
        return [...new Map(data.elements.map(normalizeOsm).filter((r) => !!r).map(r => [r.id, r])).values()];
    }
    finally {
        await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, 'discovery:lock', token);
    }
}
export async function searchOpenData(params) {
    for (const category of params.categories)
        if (!OSM_CATEGORIES[category])
            throw new ApiError(422, `Unsupported open-data category: ${category}`);
    const key = 'discovery:cache:' + createHash('sha256').update(JSON.stringify({ region: params.region, categories: [...params.categories].sort(), file: env.OPEN_DATA_FILE, url: env.OVERPASS_URL })).digest('hex');
    const offset = params.pageToken ? Number(params.pageToken) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 500)
        throw new ApiError(400, 'Invalid page cursor');
    let records;
    const cached = await redis.get(key);
    if (cached)
        records = JSON.parse(cached);
    else {
        if (offset)
            throw new ApiError(410, 'Search expired. Start a new preview.');
        records = env.OPEN_DATA_FILE ? await localSearch(params) : await remoteSearch(params);
        await redis.set(key, JSON.stringify(records), 'EX', 900);
    }
    const limit = Math.min(params.limit ?? 20, 20);
    return { places: records.slice(offset, offset + limit), nextPageToken: offset + limit < records.length ? String(offset + limit) : null, totalEstimate: records.length, staging: false };
}
//# sourceMappingURL=service.js.map