import { describe, expect, it, vi } from 'vitest';
import { adzuna } from '../../src/ingestion/adapters/adzuna.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Adzuna adapter (BYOK)', () => {
  it('throws clear blocked error when unconfigured', async () => {
    const adapter = adzuna(() => null, vi.fn() as unknown as typeof fetch);
    await expect(adapter.list('us|software engineer|remote')).rejects.toMatchObject({
      kind: 'blocked',
    });
  });

  it('calls official API with credentials and maps results', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain('https://api.adzuna.com/v1/api/jobs/in/search/1?');
      expect(url).toContain('app_id=test-id');
      expect(url).toContain('app_key=test-key');
      expect(url).toContain('what=typescript');
      expect(url).toContain('where=Bengaluru');
      return jsonResponse({
        count: 1,
        results: [
          {
            id: 123,
            title: 'TypeScript Engineer',
            description: '<p>Build APIs</p>',
            created: '2026-11-20T10:00:00Z',
            redirect_url: 'https://www.adzuna.in/details/123',
            contract_time: 'full_time',
            salary_min: 1000000,
            salary_max: 2000000,
            salary_is_predicted: '0',
            company: { display_name: 'Acme India' },
            location: { display_name: 'Bengaluru, Karnataka', area: ['India', 'Karnataka', 'Bengaluru'] },
            category: { label: 'IT Jobs' },
          },
        ],
      });
    });

    const adapter = adzuna(() => ({ appId: 'test-id', appKey: 'test-key' }), fetchMock as unknown as typeof fetch);
    const jobs = await adapter.list('in|typescript|Bengaluru');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: 'adzuna',
      board: 'in|typescript|Bengaluru',
      sourceJobId: '123',
      employer: 'Acme India',
      title: 'TypeScript Engineer',
      locationText: 'Bengaluru, Karnataka',
      department: 'IT Jobs',
      employmentType: 'full_time',
    });
    expect(jobs[0]!.applyUrl).toBe('https://www.adzuna.in/details/123');
    expect(jobs[0]!.salary).toMatchObject({ currency: 'INR', min: 1000000, max: 2000000, interval: 'year' });
  });
});
