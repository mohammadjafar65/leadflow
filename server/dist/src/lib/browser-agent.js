import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
// Add stealth plugin to Playwright
chromium.use(stealth());
let globalBrowser = null;
let globalContext = null;
export async function getBrowserContext() {
    if (!globalBrowser) {
        globalBrowser = await chromium.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-gpu",
            ],
        });
    }
    if (!globalContext) {
        globalContext = await globalBrowser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        });
    }
    return globalContext;
}
export async function closeBrowser() {
    if (globalContext) {
        await globalContext.close();
        globalContext = null;
    }
    if (globalBrowser) {
        await globalBrowser.close();
        globalBrowser = null;
    }
}
/**
 * Human-like delay helper
 */
export async function randomDelay(min = 1000, max = 3000) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Human-like scrolling helper
 */
export async function humanScroll(page, selector) {
    try {
        const box = await page.locator(selector).boundingBox();
        if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.wheel(0, Math.random() * 500 + 200);
            await randomDelay(500, 1500);
        }
    }
    catch {
        // Ignore if selector not found
    }
}
//# sourceMappingURL=browser-agent.js.map