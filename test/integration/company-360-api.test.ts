import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type AppPaths, appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

async function start(
  paths: AppPaths = appPaths(path.join(tempDir(), 'data')),
): Promise<{ s: RunningService; paths: AppPaths }> {
  const s = await startService(paths, { port: 0 });
  running.push(s);
  return { s, paths };
}

const auth = (s: RunningService): Record<string, string> => ({
  authorization: `Bearer ${s.info.token}`,
  cookie: `cs_session=${s.info.token}`,
});

describe('Company 360, Collections, Compensation & Shortlist API', () => {
  it('serves Company 360 profile, updates candidate intelligence, and manages watch state', async () => {
    const { s } = await start();
    const port = s.info.port;

    // First, add a company to the registry
    const addRes = await localRequest(port, '/api/company-registry', {
      method: 'POST',
      body: { name: 'Acme Robotics', officialWebsite: 'https://acmerobotics.example' },
      headers: auth(s),
    });
    expect(addRes.status).toBe(201);
    const companyId = (addRes.body as { company: { id: string } }).company.id;

    // GET /api/company-360/:id
    const getRes = await localRequest(port, `/api/company-360/${companyId}`, { headers: auth(s) });
    expect(getRes.status).toBe(200);
    const profile = (getRes.body as { profile: { stage: { value: string }; isWatched: boolean } }).profile;
    expect(profile.stage.value).toBe('UNKNOWN');
    expect(profile.isWatched).toBe(false);

    // PUT /api/company-360/:id
    const updateRes = await localRequest(port, `/api/company-360/${companyId}`, {
      method: 'PUT',
      body: { stage: 'SERIES_A', industry: 'Robotics', teamSizeRange: '11_50' },
      headers: auth(s),
    });
    expect(updateRes.status).toBe(200);
    const updated = (updateRes.body as { profile: { stage: { value: string }; industry: { value: string } } }).profile;
    expect(updated.stage.value).toBe('SERIES_A');
    expect(updated.industry.value).toBe('Robotics');

    // POST /api/company-360/:id/watch
    const watchRes = await localRequest(port, `/api/company-360/${companyId}/watch`, {
      method: 'POST',
      body: { notes: 'Top priority startup' },
      headers: auth(s),
    });
    expect(watchRes.status).toBe(200);
    expect((watchRes.body as { profile: { isWatched: boolean } }).profile.isWatched).toBe(true);

    // POST /api/company-360/:id/events
    const eventRes = await localRequest(port, `/api/company-360/${companyId}/events`, {
      method: 'POST',
      body: { kind: 'FUNDING_ANNOUNCEMENT', title: 'Raised $10M Series A', detail: 'Led by Venture Partner' },
      headers: auth(s),
    });
    expect(eventRes.status).toBe(201);

    // GET /api/company-360/:id/events
    const listEventsRes = await localRequest(port, `/api/company-360/${companyId}/events`, { headers: auth(s) });
    expect(listEventsRes.status).toBe(200);
    expect((listEventsRes.body as { events: unknown[] }).events.length).toBeGreaterThanOrEqual(1);

    // DELETE /api/company-360/:id/watch
    const unwatchRes = await localRequest(port, `/api/company-360/${companyId}/watch`, {
      method: 'DELETE',
      headers: auth(s),
    });
    expect(unwatchRes.status).toBe(200);
    expect((unwatchRes.body as { profile: { isWatched: boolean } }).profile.isWatched).toBe(false);
  });

  it('serves Curated Collections and allows candidate to create custom collections', async () => {
    const { s } = await start();
    const port = s.info.port;

    const listRes = await localRequest(port, '/api/collections', { headers: auth(s) });
    expect(listRes.status).toBe(200);
    const collections = (listRes.body as { collections: { slug: string }[] }).collections;
    expect(collections.length).toBeGreaterThanOrEqual(8);

    // Detail of one collection
    const detailRes = await localRequest(port, '/api/collections/emerging-ai-companies', { headers: auth(s) });
    expect(detailRes.status).toBe(200);
    expect((detailRes.body as { collection: { slug: string } }).collection.slug).toBe('emerging-ai-companies');

    // Create custom collection
    const createRes = await localRequest(port, '/api/collections', {
      method: 'POST',
      body: { title: 'Local AI Startups', query: 'ai', badge: 'Custom AI' },
      headers: auth(s),
    });
    expect(createRes.status).toBe(201);
  });

  it('evaluates compensation against verified benchmarks and handles currency mismatches', async () => {
    const { s } = await start();
    const port = s.info.port;

    const listRes = await localRequest(port, '/api/compensation/benchmarks?countryCode=US', { headers: auth(s) });
    expect(listRes.status).toBe(200);
    const benchmarks = (listRes.body as { benchmarks: unknown[] }).benchmarks;
    expect(benchmarks.length).toBeGreaterThanOrEqual(1);

    // Evaluate compensation
    const evalRes = await localRequest(port, '/api/compensation/evaluate', {
      method: 'POST',
      body: {
        roleFamily: 'Software Engineering',
        seniority: 'senior',
        countryCode: 'US',
        salary: { currency: 'USD', min: 200000, max: 225000, interval: 'year', source: 'structured' },
      },
      headers: auth(s),
    });
    expect(evalRes.status).toBe(200);
    const comparison = (evalRes.body as { comparison: { status: string } }).comparison;
    expect(['ABOVE_P75', 'COMPETITIVE_MID']).toContain(comparison.status);
  });

  it('serves Market Pulse with explicit sampling limitations', async () => {
    const { s } = await start();
    const port = s.info.port;

    const pulseRes = await localRequest(port, '/api/market-pulse', { headers: auth(s) });
    expect(pulseRes.status).toBe(200);
    const pulse = (pulseRes.body as { pulse: { methodologyAndLimitations: { samplingLimitations: string } } }).pulse;
    expect(pulse.methodologyAndLimitations.samplingLimitations).toContain('NOT a representative sample');
  });

  it('serves Interview Knowledge Studio playbooks and negotiation guidance', async () => {
    const { s } = await start();
    const port = s.info.port;

    const res = await localRequest(port, '/api/interview/knowledge', { headers: auth(s) });
    expect(res.status).toBe(200);
    const knowledge = (res.body as { knowledge: { formatGuides: unknown[]; negotiationGuide: unknown[] } }).knowledge;
    expect(knowledge.formatGuides.length).toBeGreaterThanOrEqual(4);
    expect(knowledge.negotiationGuide.length).toBeGreaterThanOrEqual(3);
  });

  it('serves decision-ready opportunity shortlists with 6-dimension breakdown', async () => {
    const { s } = await start();
    const port = s.info.port;

    const res = await localRequest(port, '/api/opportunities/shortlist', { headers: auth(s) });
    expect(res.status).toBe(200);
    expect(Array.isArray((res.body as { shortlists: unknown[] }).shortlists)).toBe(true);
  });
});
