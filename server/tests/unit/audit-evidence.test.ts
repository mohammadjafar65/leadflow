import { expect, it, vi } from 'vitest';
vi.mock('../../src/lib/safe-fetch.js', () => ({ fetchPublicText: vi.fn() }));
import { fetchPublicText } from '../../src/lib/safe-fetch.js';
import { inspectWebsiteStatus, runWebsiteAudit } from '../../src/lib/audit-engine.js';
it('does not label a blocked or timed-out site dead', async () => {
 vi.mocked(fetchPublicText).mockRejectedValueOnce(new Error('Source request timed out'));
 await expect(inspectWebsiteStatus('https://example.org','example.org')).rejects.toThrow();
});
it('reports only observed HTML checks, without invented timing or viewport findings', async () => {
 vi.mocked(fetchPublicText).mockResolvedValueOnce({url:'https://example.org',status:200,text:'<html><head><title>Example</title><meta name="viewport" content="width=device-width"><meta name="description" content="Example"></head><body><h1>Example</h1></body></html>'});
 const report=await runWebsiteAudit({leadId:'test',companyName:'Example',websiteUrl:'https://example.org'});
 expect(JSON.stringify(report)).not.toMatch(/3\.8s|below.*viewport|60%|render-blocking/);
 expect(report.pillars.performance.summary).toContain('Not measured');
 expect(report.findings).toEqual([]);
});
