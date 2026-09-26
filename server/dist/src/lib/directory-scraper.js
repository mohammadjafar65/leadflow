import { getBrowserContext, randomDelay, humanScroll } from "./browser-agent.js";
export async function scrapeLocalDirectory(directory, query, location, limit = 20) {
    const context = await getBrowserContext();
    const page = await context.newPage();
    const results = [];
    try {
        if (directory === "yelp") {
            const url = `https://www.yelp.com/search?find_desc=${encodeURIComponent(query)}&find_loc=${encodeURIComponent(location)}`;
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await randomDelay(2000, 4000);
            // Simple human-like scrolling
            for (let i = 0; i < 3; i++) {
                await page.mouse.wheel(0, 1000);
                await randomDelay(1000, 2000);
            }
            // Extract listings on Yelp
            const cards = await page.$$("div.container__09f24__mpR8_");
            for (const card of cards) {
                if (results.length >= limit)
                    break;
                try {
                    const nameEl = await card.$("a.css-19v1rkv");
                    const name = nameEl ? await nameEl.textContent() : null;
                    if (!name)
                        continue;
                    // Note: Yelp hides phone numbers and emails on the search page,
                    // usually requiring a click to the actual profile.
                    // For MVP, we extract basic info that's available.
                    const addressEl = await card.$("p.css-dzq7l1");
                    const address = addressEl ? await addressEl.textContent() : "";
                    // We'd ideally click through to get full details (website, phone)
                    // but for performance in this MVP, we mock the deep dive.
                    results.push({
                        id: `yelp_${Math.random().toString(36).substring(7)}`,
                        name: name.replace(/^\d+\.\s*/, "").trim(), // Remove "1. " from Yelp names
                        address: address || `${location}`,
                        lat: 0,
                        lng: 0,
                        types: [query],
                        category: query,
                        staging: false,
                    });
                }
                catch (e) {
                    // Ignore individual card errors
                }
            }
        }
        else if (directory === "yellowpages") {
            const url = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}`;
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await randomDelay(2000, 4000);
            for (let i = 0; i < 3; i++) {
                await page.mouse.wheel(0, 1000);
                await randomDelay(1000, 2000);
            }
            const cards = await page.$$("div.result");
            for (const card of cards) {
                if (results.length >= limit)
                    break;
                try {
                    const nameEl = await card.$("a.business-name");
                    const name = nameEl ? await nameEl.textContent() : null;
                    if (!name)
                        continue;
                    const phoneEl = await card.$("div.phones");
                    const phone = phoneEl ? await phoneEl.textContent() : undefined;
                    const addressEl = await card.$("div.street-address");
                    const address = addressEl ? await addressEl.textContent() : location;
                    const websiteEl = await card.$("a.track-visit-website");
                    const website = websiteEl ? await websiteEl.getAttribute("href") : undefined;
                    results.push({
                        id: `yp_${Math.random().toString(36).substring(7)}`,
                        name: name.trim(),
                        address: address || "",
                        phone: phone || undefined,
                        website: website || undefined,
                        lat: 0,
                        lng: 0,
                        types: [query],
                        category: query,
                        staging: false,
                    });
                }
                catch (e) {
                    // Ignore
                }
            }
        }
        else if (directory === "google_maps") {
            const url = `https://www.google.com/maps/search/${encodeURIComponent(query + " in " + location)}`;
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await randomDelay(3000, 5000);
            // Scroll the sidebar
            for (let i = 0; i < 5; i++) {
                await humanScroll(page, 'div[role="feed"]');
                await randomDelay(1500, 3000);
            }
            const cards = await page.$$("a.hfpxzc");
            for (const card of cards) {
                if (results.length >= limit)
                    break;
                try {
                    const name = await card.getAttribute("aria-label");
                    if (!name)
                        continue;
                    // Note: Full extraction requires clicking each card and waiting for the side panel to update,
                    // which is slow. For MVP, we extract the name and use the query location.
                    // In a production setup, we would click and parse `div.Io6YTe`.
                    results.push({
                        id: `gmap_${Math.random().toString(36).substring(7)}`,
                        name,
                        address: location, // Approximation without clicking
                        lat: 0,
                        lng: 0,
                        types: [query],
                        category: query,
                        staging: false,
                    });
                }
                catch (e) {
                    // Ignore
                }
            }
        }
    }
    finally {
        await page.close();
    }
    return results;
}
//# sourceMappingURL=directory-scraper.js.map