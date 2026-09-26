export const OSM_CATEGORIES = {
    restaurants: ['amenity', 'restaurant'], cafes: ['amenity', 'cafe'], bakeries: ['shop', 'bakery'], bars: ['amenity', 'bar'],
    dental_clinics: ['amenity', 'dentist'], doctors: ['amenity', 'doctors'], pharmacies: ['amenity', 'pharmacy'], veterinarians: ['amenity', 'veterinary'],
    law_firms: ['office', 'lawyer'], accountants: ['office', 'accountant'], real_estate: ['office', 'estate_agent'], insurance_agents: ['office', 'insurance'],
    plumbers: ['craft', 'plumber'], electricians: ['craft', 'electrician'], roofing: ['craft', 'roofer'], photographers: ['craft', 'photographer'],
    auto_repair: ['shop', 'car_repair'], auto_dealers: ['shop', 'car'], tire_shops: ['shop', 'tyres'], beauty_salons: ['shop', 'hairdresser'],
    nail_salons: ['shop', 'beauty'], tattoo_shops: ['shop', 'tattoo'], fitness_gyms: ['leisure', 'fitness_centre'], hotels: ['tourism', 'hotel'],
    hostels: ['tourism', 'hostel'], travel_agents: ['shop', 'travel_agency'], daycares: ['amenity', 'kindergarten'], music_schools: ['amenity', 'music_school'],
    driving_schools: ['amenity', 'driving_school'], architects: ['office', 'architect'], auto_detail: ['amenity', 'car_wash'], locksmiths: ['craft', 'locksmith'],
};
function web(value) { if (!value)
    return undefined; try {
    const u = new URL(value.startsWith('http') ? value : `https://${value}`);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : undefined;
}
catch {
    return undefined;
} }
export function normalizeOsm(e) {
    if (!e || typeof e !== 'object')
        return null;
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (typeof t.name !== 'string' || !t.name.trim() || Object.values(t).some(v => typeof v !== 'string') || !['node', 'way', 'relation'].includes(e.type) || !Number.isSafeInteger(e.id) || e.id <= 0 || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        return null;
    const category = Object.entries(OSM_CATEGORIES).find(([, [k, v]]) => t[k] === v)?.[0];
    return { id: `${e.type}/${e.id}`, name: t.name.trim(), address: t['addr:full'] || [t['addr:housenumber'], t['addr:street'], t['addr:city'], t['addr:postcode'], t['addr:country']].filter(Boolean).join(', '),
        lat, lng, website: web(t.website ?? t['contact:website']), phone: t.phone ?? t['contact:phone'], email: t.email ?? t['contact:email'], category, types: category ? [category] : [], staging: false,
        source: 'openstreetmap', sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`, observedAt: new Date().toISOString(), attribution: '© OpenStreetMap contributors (ODbL)' };
}
export function buildOverpassQuery(categories, center, radius) {
    if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng) || Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180 || !Number.isFinite(radius) || radius < 100 || radius > 50000 || !categories.length || categories.length > 10)
        throw new Error('Invalid search area');
    const clauses = categories.map(id => { const tag = OSM_CATEGORIES[id]; if (!tag)
        throw new Error(`Unsupported open-data category: ${id}`); return `nwr["${tag[0]}"="${tag[1]}"](around:${Math.round(radius)},${center.lat},${center.lng});`; });
    return `[out:json][timeout:15];(${clauses.join('')});out center 500;`;
}
//# sourceMappingURL=osm.js.map