import { env } from "../config/env.js";
import { getCategory } from "./categories.js";
const PLACES_BASE = "https://places.googleapis.com/v1";
async function placesFetch(path, init) {
    const headers = {
        "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_API_KEY,
        "X-Goog-FieldMask": init.fieldMask,
        "Content-Type": "application/json",
    };
    // Only pass Referer if specified in CLIENT_ORIGIN
    if (env.CLIENT_ORIGIN && !env.CLIENT_ORIGIN.includes("localhost")) {
        headers["Referer"] = env.CLIENT_ORIGIN.split(",")[0].trim();
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(`${PLACES_BASE}${path}`, {
            ...init,
            signal: controller.signal,
            headers: {
                ...headers,
                ...(init.headers ?? {}),
            },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Google Places API ${res.status}: ${body.slice(0, 300)}`);
        }
        return res.json();
    }
    finally {
        clearTimeout(timer);
    }
}
const SEARCH_FIELD_MASK = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.rating",
    "places.userRatingCount",
    "places.primaryType",
    "places.types",
    "places.regularOpeningHours.weekdayDescriptions",
    "nextPageToken",
].join(",");
function mapPlace(p, staging) {
    const loc = (p.location ?? {});
    return {
        id: String(p.id),
        name: (p.displayName?.text ?? String(p.name ?? "")),
        address: String(p.formattedAddress ?? ""),
        lat: loc.latitude ?? 0,
        lng: loc.longitude ?? 0,
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? undefined,
        website: p.websiteUri ?? undefined,
        rating: p.rating,
        reviewCount: p.userRatingCount,
        category: p.primaryType ?? undefined,
        types: p.types ?? [],
        openingHours: p.regularOpeningHours?.weekdayDescriptions ?? undefined,
        staging,
    };
}
async function realSearch(params) {
    const keywords = params.categories.map((id) => getCategory(id)?.keyword).filter(Boolean);
    const body = { pageSize: Math.min(params.limit ?? 20, 20) };
    if (params.pageToken)
        body.pageToken = params.pageToken;
    if (params.region.type === "radius" && params.region.center) {
        const types = params.categories.flatMap((id) => getCategory(id)?.types ?? []);
        if (types.length > 0) {
            body.includedTypes = types;
        }
        body.locationRestriction = {
            circle: {
                center: { latitude: params.region.center.lat, longitude: params.region.center.lng },
                radius: params.region.radiusMeters ?? 5000,
            },
        };
        // Google Places API /places:searchText strictly requires a textQuery
        body.textQuery = keywords.length > 0 ? keywords.join(" ") : "business";
    }
    else {
        const place = params.region.query ?? "";
        const categoryQuery = keywords.length > 0 ? keywords.join(", ") : "businesses";
        body.textQuery = place ? `${categoryQuery} in ${place}` : categoryQuery;
        body.rankPreference = "RELEVANCE";
    }
    const raw = (await placesFetch("/places:searchText", {
        method: "POST",
        fieldMask: SEARCH_FIELD_MASK,
        body: JSON.stringify(body),
    }));
    // Route through the same endpoint shape; searchNearby is used when a
    // radius+center is given, but searchText accepts the same restrictions.
    return {
        places: (raw.places ?? []).map((p) => mapPlace(p, false)),
        nextPageToken: raw.nextPageToken ?? null,
        totalEstimate: null,
        staging: false,
    };
}
export async function searchPlaces(params) {
    if (!env.GOOGLE_MAPS_SERVER_API_KEY || env.GOOGLE_PLACES_STAGING)
        throw new Error("Google Places is unavailable. Choose an open-data source.");
    return realSearch(params);
}
export async function getPlaceDetails(placeId) {
    if (env.GOOGLE_PLACES_STAGING || !env.GOOGLE_MAPS_SERVER_API_KEY) {
        throw new Error("staging mode has no place details endpoint");
    }
    return (await placesFetch(`/places/${encodeURIComponent(placeId)}`, {
        method: "GET",
        fieldMask: SEARCH_FIELD_MASK,
    }));
}
//# sourceMappingURL=places.js.map