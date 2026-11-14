import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { dashboardSession, tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

describe('canonical document API', () => {
  it('serves the master resume and readiness report to the dashboard only', async () => {
    const paths = appPaths(path.join(tempDir(), 'data'));
    const s = await startService(paths, { port: 0 });
    running.push(s);
    const bearer = { authorization: `Bearer ${s.info.token}` };
    const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) =>
      localRequest(s.info.port, url, { method, body, headers });

    await call('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
    await call('PUT', '/api/settings/identity.email', { value: 'jordan@example.com' });
    await call('POST', '/api/profile/facts', {
      kind: 'role',
      value: { title: 'Platform Engineer', employer: 'Synthetic Labs', startYear: 2021, endYear: null },
    });
    await call('POST', '/api/profile/facts', {
      kind: 'skill',
      value: { name: 'Kubernetes', years: 4, level: 'expert' },
    });

    const dash = await dashboardSession(s.info.port, s.info.token);
    const res = await call('GET', '/api/documents/master', undefined, dash.headers);
    expect(res.status).toBe(200);
    const body = res.body as {
      master: { content: string; counts: { roles: number; skills: number } };
      readiness: { state: string; checks: { id: string; status: string }[]; disclaimer: string };
    };
    expect(body.master.content).toContain('JORDAN EXAMPLE');
    expect(body.master.content).toContain('Platform Engineer — Synthetic Labs (2021 – Present)');
    expect(body.master.content).toContain('Kubernetes (4 years)');
    expect(body.master.counts).toMatchObject({ roles: 1, skills: 1 });
    expect(body.readiness.disclaimer).toContain('not an ATS certification');
    expect(body.readiness.checks.find((check) => check.id === 'identity')?.status).toBe('PASS');
  });
});
