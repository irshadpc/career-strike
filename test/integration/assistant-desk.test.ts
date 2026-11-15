import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { createAdapters } from '../../src/sources/adapters.js';
import { fakeFetch, greenhouseJobs } from '../fixtures/ats.js';
import { tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

async function start() {
  const adapters = createAdapters(
    fakeFetch({
      'boards-api.greenhouse.io': greenhouseJobs([
        { id: 1, title: 'Senior Backend Engineer', workplace: 'Remote' },
        { id: 2, title: 'Staff Systems Architect', workplace: 'Remote' },
        { id: 3, title: 'Tech Lead - Core Payments', workplace: 'Remote' },
      ]),
    }),
  );
  const s = await startService(appPaths(path.join(tempDir(), 'data')), { port: 0, adapters });
  running.push(s);
  const call = (method: string, url: string, body?: unknown) =>
    localRequest(s.info.port, url, { method, body, headers: { authorization: `Bearer ${s.info.token}` } });
  return { s, call };
}

describe('assistant desk & chief of staff journey', () => {
  it('manages mission, generates autonomous plan, provides briefing, and records candidate decisions', async () => {
    const { call } = await start();

    // 1. Get initial mission
    const initialMissionRes = await call('GET', '/api/assistant/mission');
    expect(initialMissionRes.status).toBe(200);
    const { mission } = initialMissionRes.body as { mission: { id: string; version: number } };
    expect(mission.id).toMatch(/^mission_/);
    expect(mission.version).toBe(1);

    // 2. Ingest jobs via source addition
    const addedSource = await call('POST', '/api/sources', { source: 'greenhouse', board: 'synthetic' });
    expect(addedSource.status).toBe(201);
    const { task } = addedSource.body as { task: { id: string } };

    // Wait for task
    for (let i = 0; i < 50; i++) {
      const res = await call('GET', `/api/tasks/${task.id}`);
      const t = (res.body as { task: { state: string } }).task;
      if (t.state === 'SUCCEEDED') break;
      await new Promise((r) => setTimeout(r, 20));
    }

    // 3. Generate plan
    const planRes = await call('POST', '/api/assistant/plan/generate', { track: 'TRACK_A' });
    expect(planRes.status).toBe(200);
    const { plan } = planRes.body as { plan: { id: string; steps: any[] } };
    expect(plan.id).toMatch(/^plan_/);
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);

    // 4. Inspect Assistant Desk briefing
    const deskRes = await call('GET', '/api/assistant/desk');
    expect(deskRes.status).toBe(200);
    const desk = deskRes.body as {
      briefing: { headline: string; answers: { whatChanged: string; whatWaitingFor: string } };
      topRecommendations: any[];
      ledger: any[];
    };
    expect(desk.briefing.headline).toContain('Decision-Ready Opportunities');
    expect(desk.briefing.answers.whatWaitingFor).toBeDefined();
    expect(desk.topRecommendations.length).toBeGreaterThanOrEqual(1);

    // 5. Candidate records decision on top opportunity
    const topJobId = desk.topRecommendations[0].job.id;
    const decisionRes = await call('POST', `/api/assistant/decision/${topJobId}`, {
      decision: 'APPLY',
      feedback: 'Excellent alignment with tech stack',
    });
    expect(decisionRes.status).toBe(200);

    // 6. Verify decision recorded in ledger
    const updatedDesk = (await call('GET', '/api/assistant/desk')).body as { ledger: any[] };
    const latestLedger = updatedDesk.ledger[0];
    expect(latestLedger.category).toBe('DECISION_RECORDED');
    expect(latestLedger.title).toBe('Candidate Decision: APPLY');
    expect(latestLedger.detail).toContain('Excellent alignment with tech stack');
  });
});
