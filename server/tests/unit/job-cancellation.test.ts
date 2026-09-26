import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), publish: vi.fn() }));
vi.mock('../../src/db/pool.js', () => ({ pool: { query: mocks.query } }));
vi.mock('../../src/db/redis.js', () => ({ publishJobEvent: mocks.publish }));
import { completeJob, setJobStatus } from '../../src/lib/jobs.js';
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ rowCount: 0 }); });
it('does not announce completion or failure when cancellation won the update race', async () => {
  await completeJob('cancelled-id', { created: 1 });
  await setJobStatus('cancelled-id', 'failed', { error: 'Late worker failure' });
  expect(mocks.publish).not.toHaveBeenCalled();
});
