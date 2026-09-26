/**
 * Deduplication (PRD FR-1.5). The composite key is:
 *   normalized phone (E.164) OR normalized domain OR
 *   (name trigram similarity >= 0.9 AND address proximity <= 100m)
 *
 * Kept pure and deterministic so it is unit-testable and auditable — the
 * same functions back the extract job and the manual merge endpoint.
 */
/** E.164-ish normalization (mirrors src/lib/utils.ts on the frontend). */
export function normalizePhone(raw, defaultCountry = "US") {
    if (!raw)
        return null;
    const digits = raw.replace(/[^\d+]/g, "");
    if (digits.startsWith("+"))
        return digits;
    if (defaultCountry === "US" && digits.length === 10)
        return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1"))
        return `+${digits}`;
    return digits.length > 6 ? `+${digits}` : null;
}
/** Bare registrable host, lowercased, www stripped. */
export function normalizeDomain(url) {
    if (!url)
        return null;
    try {
        const u = new URL(url.startsWith("http") ? url : `https://${url}`);
        return u.hostname.replace(/^www\./, "").toLowerCase();
    }
    catch {
        return null;
    }
}
/**
 * pg_trgm-compatible trigram similarity: pads the string with two leading
 * spaces, builds the set of character trigrams, and returns
 * 2*|A∩B| / (|A| + |B|). Used with the >= 0.9 threshold from FR-1.5.
 */
export function trigramSimilarity(a, b) {
    const ta = trigrams(a);
    const tb = trigrams(b);
    if (ta.size === 0 || tb.size === 0)
        return 0;
    let common = 0;
    for (const t of ta) {
        if (tb.has(t))
            common++;
    }
    return (2 * common) / (ta.size + tb.size);
}
function trigrams(s) {
    const norm = `  ${s.toLowerCase().replace(/[^a-z0-9\s]/g, "")}`;
    const out = new Set();
    for (let i = 0; i < norm.length - 2; i++) {
        out.add(norm.slice(i, i + 3));
    }
    return out;
}
/** Haversine distance in meters between two coordinates. */
export function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6_371_000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
export const NAME_SIMILARITY_THRESHOLD = 0.9;
export const PROXIMITY_THRESHOLD_M = 100;
/**
 * Finds the best dedup match for a new lead against existing candidates,
 * checking signals in this order: phone, domain, then name+proximity.
 */
export function findDedupMatch(lead, candidates) {
    const phone = normalizePhone(lead.phoneE164 ?? lead.phone_e164);
    const domain = normalizeDomain(lead.domain ?? lead.website);
    // 1. Phone match (highest confidence signal)
    if (phone) {
        for (const c of candidates) {
            const cPhone = normalizePhone(c.phoneE164 ?? c.phone_e164);
            if (cPhone && cPhone === phone)
                return { candidateId: c.id, reason: "phone" };
        }
    }
    // 2. Domain match (unique digital identity)
    if (domain) {
        for (const c of candidates) {
            const cDomain = normalizeDomain(c.domain ?? c.website);
            if (cDomain && cDomain === domain)
                return { candidateId: c.id, reason: "domain" };
        }
    }
    // 3. Exact normalized business name match
    // e.g. "Maple Table" vs "Maple Table", "Crown Grill" vs "Crown Grill"
    const cleanLeadName = lead.name.trim().toLowerCase().replace(/['"`]/g, "").replace(/\s+/g, " ");
    for (const c of candidates) {
        const cleanCandidateName = c.name.trim().toLowerCase().replace(/['"`]/g, "").replace(/\s+/g, " ");
        if (cleanLeadName.length > 2 && cleanLeadName === cleanCandidateName) {
            return { candidateId: c.id, reason: "exact_name", nameSimilarity: 1.0 };
        }
    }
    // 4. Strong name similarity + address proximity
    if (lead.lat != null && lead.lng != null) {
        let best = null;
        for (const c of candidates) {
            if (c.lat == null || c.lng == null)
                continue;
            const dist = distanceMeters(lead.lat, lead.lng, c.lat, c.lng);
            if (dist > PROXIMITY_THRESHOLD_M)
                continue;
            const sim = trigramSimilarity(lead.name, c.name);
            if (sim >= NAME_SIMILARITY_THRESHOLD) {
                if (!best || sim > (best.nameSimilarity ?? 0)) {
                    best = { candidateId: c.id, reason: "name_proximity", nameSimilarity: sim, distanceMeters: dist };
                }
            }
        }
        if (best)
            return best;
    }
    // 5. Very high name similarity for distinct brand names
    for (const c of candidates) {
        const sim = trigramSimilarity(lead.name, c.name);
        if (sim >= 0.92 && lead.name.trim().length > 5) {
            return { candidateId: c.id, reason: "name_high_similarity", nameSimilarity: sim };
        }
    }
    return null;
}
/** "Most complete" (non-empty) wins; ties break on recency (later updatedAt). */
export function pickField(primary, duplicate, primaryUpdatedAt, duplicateUpdatedAt) {
    const pEmpty = isEmpty(primary);
    const dEmpty = isEmpty(duplicate);
    if (!pEmpty && dEmpty)
        return primary;
    if (pEmpty && !dEmpty)
        return duplicate;
    if (pEmpty && dEmpty)
        return primary;
    // both non-empty: recency wins
    return new Date(duplicateUpdatedAt) > new Date(primaryUpdatedAt) ? duplicate : primary;
}
function isEmpty(v) {
    if (v === null || v === undefined)
        return true;
    if (typeof v === "string")
        return v.trim() === "";
    if (Array.isArray(v))
        return v.length === 0;
    return false;
}
/**
 * Field-level merge plan: which fields the merged lead should take from
 * primary vs duplicate. History is preserved by the caller (duplicate's
 * enrichment_records / lead_activities are copied over, and the duplicate
 * row is marked merged_into rather than deleted).
 */
export function planMerge(primary, duplicate, primaryUpdatedAt = "1970-01-01T00:00:00Z", duplicateUpdatedAt = "1970-01-01T00:00:00Z") {
    const fieldNames = new Set([...Object.keys(primary), ...Object.keys(duplicate)]);
    const merged = {};
    for (const field of fieldNames) {
        if (field === "id")
            continue;
        merged[field] = pickField(primary[field], duplicate[field], primaryUpdatedAt, duplicateUpdatedAt);
    }
    return merged;
}
//# sourceMappingURL=dedup.js.map