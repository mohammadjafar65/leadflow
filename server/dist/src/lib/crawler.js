import { fetchPublicText } from "./safe-fetch.js";
import { redis } from "../db/redis.js";
export async function crawlWebsite(websiteUrl, _businessName) {
    const target = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    const lock = await redis.set(`crawl:${target.hostname}`, '1', 'EX', 30, 'NX');
    if (!lock)
        throw new Error('Website crawl is cooling down. Retry shortly.');
    const robots = await fetchPublicText(new URL('/robots.txt', target).href, { maxBytes: 100000 });
    if (robots.status !== 404 && robots.status !== 200)
        throw new Error('Could not verify website crawl policy');
    const blocked = robots.status === 200 ? [...robots.text.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map(m => m[1]) : [];
    if (blocked.some(path => target.pathname.startsWith(path.split('*')[0])))
        throw new Error('Website disallows this crawl');
    const result = { socials: {}, sourceUrl: target.href };
    const response = await fetchPublicText(target.href);
    if (response.status !== 200)
        throw new Error(`Website unavailable (${response.status})`);
    const html = response.text;
    result.sourceUrl = response.url;
    const emails = [...html.matchAll(/(?:mailto:)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)].map(m => m[1].toLowerCase()).filter(e => !/(sentry\.io|example\.com|wixpress\.com|\.(png|jpg|svg|webp)$)/i.test(e));
    result.email = emails.find(e => e.endsWith('@' + target.hostname.replace(/^www\./, ''))) ?? emails[0];
    for (const [key, pattern] of Object.entries({ linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[\w-]+/i, instagram: /https?:\/\/(?:www\.)?instagram\.com\/[\w.]+/i, facebook: /https?:\/\/(?:www\.)?facebook\.com\/[\w.]+/i, twitter: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[\w]+/i })) {
        const match = html.match(pattern);
        if (match)
            result.socials[key] = match[0];
    }
    result.metaDescription = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i)?.[1];
    return result;
}
//# sourceMappingURL=crawler.js.map