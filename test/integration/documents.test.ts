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

  it('exports the master resume as PDF and DOCX and reports local parser coverage only', async () => {
    const paths = appPaths(path.join(tempDir(), 'data'));
    const s = await startService(paths, { port: 0 });
    running.push(s);
    const bearer = { authorization: `Bearer ${s.info.token}` };
    const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = bearer) =>
      localRequest(s.info.port, url, { method, body, headers });

    await call('PUT', '/api/settings/identity.fullName', { value: 'Jordan Example' });
    await call('POST', '/api/profile/facts', {
      kind: 'skill',
      value: { name: 'Kubernetes', years: 4 },
    });
    const dash = await dashboardSession(s.info.port, s.info.token);

    for (const [format, signature] of [
      ['pdf', '%PDF-'],
      ['docx', 'PK'],
    ] as const) {
      const res = await fetch(`http://127.0.0.1:${s.info.port}/api/documents/master/export?format=${format}`, {
        headers: { cookie: dash.cookie },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toContain(`.${format}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, signature.length).toString('latin1')).toBe(signature);
      expect(bytes.length).toBeGreaterThan(100);
    }

    const report = await call('GET', '/api/documents/master/parser-report', undefined, dash.headers);
    expect(report.status).toBe(200);
    const reports = (report.body as { reports: { format: string; basis: string; wordCoverage: number }[] }).reports;
    expect(reports.map((item) => item.format)).toEqual(['pdf', 'docx']);
    expect(reports.every((item) => item.basis === 'LOCAL_PARSER_TEST_ONLY')).toBe(true);
    expect(reports.every((item) => item.wordCoverage === 1)).toBe(true);

    const exports = await call('GET', '/api/documents/exports', undefined, dash.headers);
    expect((exports.body as { exports: unknown[] }).exports).toHaveLength(2);

    // The local CLI bearer may read the export; remote assistant scopes are blocked in the route.
    expect((await call('GET', '/api/documents/master/export?format=pdf')).status).toBe(200);
  });
});
