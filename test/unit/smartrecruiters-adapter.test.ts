import { describe, expect, it, vi } from 'vitest';
import { smartrecruiters } from '../../src/ingestion/adapters/smartrecruiters.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SmartRecruiters adapter', () => {
  it('paginates, caps at 300, and maps posting fields into unified schema', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get('offset') ?? '0');
      if (offset === 0) {
        return jsonResponse({
          offset: 0,
          limit: 100,
          totalFound: 350,
          content: Array.from({ length: 100 }, (_, i) => ({
            id: `id-${i}`,
            name: `Role ${i}`,
            company: { identifier: 'BoschGroup', name: 'Bosch Group' },
            location: {
              city: i % 2 === 0 ? 'Bengaluru' : 'Berlin',
              region: 'R',
              country: i % 2 === 0 ? 'in' : 'de',
              remote: i % 3 === 0,
            },
            releasedDate: '2026-11-01T00:00:00.000Z',
            department: { label: 'Engineering' },
            typeOfEmployment: { label: 'Full-time' },
          })),
        });
      }
      if (offset === 100) {
        return jsonResponse({
          offset: 100,
          limit: 100,
          totalFound: 350,
          content: Array.from({ length: 100 }, (_, i) => ({
            id: `id-${100 + i}`,
            name: `Role ${100 + i}`,
            company: { identifier: 'BoschGroup', name: 'Bosch Group' },
            location: { city: 'London', region: 'England', country: 'gb', remote: false },
            releasedDate: '2026-11-02T00:00:00.000Z',
            typeOfEmployment: { label: 'Permanent' },
          })),
        });
      }
      if (offset === 200) {
        return jsonResponse({
          offset: 200,
          limit: 100,
          totalFound: 350,
          content: Array.from({ length: 100 }, (_, i) => ({
            id: `id-${200 + i}`,
            name: `Role ${200 + i}`,
            company: { identifier: 'BoschGroup', name: 'Bosch Group' },
            location: { city: 'New York', region: 'NY', country: 'us', remote: false },
            releasedDate: '2026-11-03T00:00:00.000Z',
          })),
        });
      }
      return jsonResponse({ offset, limit: 100, totalFound: 350, content: [] });
    });

    const adapter = smartrecruiters(fetchMock as unknown as typeof fetch);
    const jobs = await adapter.list('BoschGroup');

    expect(fetchMock).toHaveBeenCalledTimes(3); // 100+100+100 = 300 cap reached
    expect(jobs).toHaveLength(300);
    expect(jobs[0]).toMatchObject({
      source: 'smartrecruiters',
      board: 'BoschGroup',
      sourceJobId: 'id-0',
      employer: 'Bosch Group',
      title: 'Role 0',
      locationText: 'Bengaluru, R, IN',
      department: 'Engineering',
    });
    expect(jobs[0]!.postingUrl).toBe('https://jobs.smartrecruiters.com/BoschGroup/id-0');
    expect(jobs[0]!.applyUrl).toBe('https://jobs.smartrecruiters.com/BoschGroup/id-0');
    expect(jobs[0]!.publishedAt).toBe('2026-11-01T00:00:00.000Z');
  });
});
