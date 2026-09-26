import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a,b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && [18,19,51].includes(b) || a === 203 && b === 0);
  }
  return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(db8|0):/i.test(ip) && !/^2002:/i.test(ip);
}

/** DNS is resolved once and pinned to the socket. Every redirect is revalidated. */
export async function fetchPublicText(input: string, options: { method?: string; body?: string; maxBytes?: number; headers?: Record<string,string> } = {}, redirects = 0): Promise<{ url: string; text: string; status: number; retryAfter?: string }> {
  const url = new URL(input);
  if (!["https:","http:"].includes(url.protocol) || url.username || url.password || !["", "80", "443"].includes(url.port)) throw new Error("Only public HTTP(S) URLs on standard ports are allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error("Private or reserved network destination blocked");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method: options.method ?? 'GET',
      headers: { 'User-Agent': 'LeadFlow/1.0 (business discovery)', Accept: 'text/html,application/json,text/plain', ...options.headers },
      lookup: ((_host: string, opts: { all?: boolean }, done: (...args: unknown[]) => void) => {
        if (opts.all) done(null, [address]);
        else done(null, address.address, address.family);
      }) as never,
    }, res => {
      const status = res.statusCode ?? 500;
      if ([301,302,303,307,308].includes(status) && res.headers.location) {
        res.resume();
        if (redirects >= 3) { reject(new Error('Too many redirects')); return; }
        const next = new URL(res.headers.location, url).href;
        const nextOptions = status === 303 ? { ...options, method: 'GET', body: undefined } : options;
        fetchPublicText(next, nextOptions, redirects + 1).then(resolve,reject); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > (options.maxBytes ?? 2_000_000)) req.destroy(new Error('Source response exceeds size limit'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ url: url.href, text: Buffer.concat(chunks).toString('utf8'), status, retryAfter: res.headers['retry-after'] }));
    });
    const timer = setTimeout(() => req.destroy(new Error('Source request timed out')), 20000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject);
    if (options.body) req.write(options.body); req.end();
  });
}
