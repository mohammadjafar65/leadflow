export function serializeLead(row) {
    return {
        id: row.id,
        organizationId: row.organization_id,
        assignedTo: row.assigned_to ?? undefined,
        name: row.name,
        dbaNames: row.dba_names ?? undefined,
        category: row.category ?? undefined,
        website: row.website ?? undefined,
        domain: row.domain ?? undefined,
        email: (row.enrichment ?? []).find((e) => e.field === "email")?.value ?? undefined,
        phoneE164: row.phone_e164 ?? undefined,
        address: row.address ?? undefined,
        lat: row.lat != null ? Number(row.lat) : undefined,
        lng: row.lng != null ? Number(row.lng) : undefined,
        rating: row.rating != null ? Number(row.rating) : undefined,
        reviewCount: row.review_count != null ? Number(row.review_count) : undefined,
        stage: row.stage,
        score: row.score,
        scoreBreakdown: row.score_breakdown ?? undefined,
        tags: row.tags ?? [],
        enrichment: (row.enrichment ?? []).map((e) => ({
            field: e.field,
            value: e.value,
            source: e.source,
            confidence: Number(e.confidence),
            observedAt: e.observed_at,
        })),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
/** Aggregates enrichment + tags onto a lead row (used by list/detail queries). */
export function withDetails(l) {
    return l;
}
//# sourceMappingURL=serialize.js.map