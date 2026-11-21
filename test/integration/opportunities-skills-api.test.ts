import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appPaths } from '../../src/core/paths.js';
import { localRequest } from '../../src/service/http-client.js';
import { type RunningService, startService } from '../../src/service/service.js';
import { createAdapters } from '../../src/sources/adapters.js';
import { tempDir } from '../helpers.js';

const running: RunningService[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

async function start() {
  const adapters = createAdapters();
  const s = await startService(appPaths(path.join(tempDir(), 'data')), { port: 0, adapters });
  running.push(s);
  const call = (method: string, url: string, body?: unknown) =>
    localRequest(s.info.port, url, { method, body, headers: { authorization: `Bearer ${s.info.token}` } });
  return { s, call };
}

describe('Opportunities Skill Filtering & Overlap API', () => {
  it('extracts skills at creation, exposes live facets, and supports ANY, ALL, and exclude filtering', async () => {
    const { call } = await start();

    // 1. Add three manual jobs with distinct skill profiles
    const job1Res = await call('POST', '/api/jobs', {
      employer: 'Alpha Labs',
      title: 'Staff Frontend Engineer',
      location: 'San Francisco, CA',
      remotePolicy: 'remote',
      description: 'We are seeking a staff frontend engineer expert in TypeScript, React, and Tailwind CSS.',
    });
    expect(job1Res.status).toBe(201);
    const job1Id = (job1Res.body as { job: { id: string } }).job.id;

    const job2Res = await call('POST', '/api/jobs', {
      employer: 'Beta Systems',
      title: 'Senior Fullstack Engineer',
      location: 'New York, NY',
      remotePolicy: 'hybrid',
      description: 'Seeking a senior engineer proficient with TypeScript, Python, and Kubernetes microservices.',
    });
    expect(job2Res.status).toBe(201);
    const job2Id = (job2Res.body as { job: { id: string } }).job.id;

    const job3Res = await call('POST', '/api/jobs', {
      employer: 'Gamma Data',
      title: 'Data & Infra Engineer',
      location: 'London, UK',
      remotePolicy: 'onsite',
      description: 'Data platform role using Python, Snowflake, and Docker for containerized pipelines.',
    });
    expect(job3Res.status).toBe(201);
    const job3Id = (job3Res.body as { job: { id: string } }).job.id;

    // 2. Query skill facets via GET /api/opportunities/skills
    const facetsRes = await call('GET', '/api/opportunities/skills');
    expect(facetsRes.status).toBe(200);
    const facets = (facetsRes.body as { skills: { slug: string; label: string; count: number }[] }).skills;

    const tsFacet = facets.find((f) => f.slug === 'typescript');
    expect(tsFacet).toBeDefined();
    expect(tsFacet?.count).toBe(2); // Job 1 and Job 2

    const pyFacet = facets.find((f) => f.slug === 'python');
    expect(pyFacet).toBeDefined();
    expect(pyFacet?.count).toBe(2); // Job 2 and Job 3

    const k8sFacet = facets.find((f) => f.slug === 'kubernetes');
    expect(k8sFacet).toBeDefined();
    expect(k8sFacet?.count).toBe(1); // Job 2 only

    // 3. Filter by single skill: TypeScript
    const tsJobsRes = await call('GET', '/api/opportunities?skills=typescript');
    expect(tsJobsRes.status).toBe(200);
    const tsJobs = (
      tsJobsRes.body as { total: number; jobs: { id: string; allSkills: string[]; matchedSkills: string[] }[] }
    ).jobs;
    expect(tsJobs.length).toBe(2);
    expect(tsJobs.map((j) => j.id)).toContain(job1Id);
    expect(tsJobs.map((j) => j.id)).toContain(job2Id);
    expect(tsJobs[0]!.matchedSkills).toContain('TypeScript');

    // 4. Filter with Match ALL: TypeScript AND Kubernetes
    const allSkillsRes = await call('GET', '/api/opportunities?skills=typescript,kubernetes&skillMode=all');
    expect(allSkillsRes.status).toBe(200);
    const allJobs = (allSkillsRes.body as { total: number; jobs: { id: string; matchedSkills: string[] }[] }).jobs;
    expect(allJobs.length).toBe(1);
    expect(allJobs[0]!.id).toBe(job2Id);
    expect(allJobs[0]!.matchedSkills).toContain('TypeScript');
    expect(allJobs[0]!.matchedSkills).toContain('Kubernetes');

    // 5. Filter with Match ANY: TypeScript OR Kubernetes (ranked by overlap count DESC)
    const anySkillsRes = await call('GET', '/api/opportunities?skills=typescript,kubernetes&skillMode=any');
    expect(anySkillsRes.status).toBe(200);
    const anyJobs = (anySkillsRes.body as { total: number; jobs: { id: string; matchedSkills: string[] }[] }).jobs;
    expect(anyJobs.length).toBe(2);
    // Job 2 has 2 matched skills (TypeScript + Kubernetes), Job 1 has 1 matched skill (TypeScript)
    // Job 2 must rank first due to higher skill overlap count
    expect(anyJobs[0]!.id).toBe(job2Id);
    expect(anyJobs[0]!.matchedSkills.length).toBe(2);
    expect(anyJobs[1]!.id).toBe(job1Id);
    expect(anyJobs[1]!.matchedSkills.length).toBe(1);

    // 6. Exclude skills: TypeScript roles, but exclude Python roles
    const excludeRes = await call('GET', '/api/opportunities?skills=typescript&excludeSkills=python');
    expect(excludeRes.status).toBe(200);
    const excludedJobs = (excludeRes.body as { total: number; jobs: { id: string }[] }).jobs;
    expect(excludedJobs.length).toBe(1);
    expect(excludedJobs[0]!.id).toBe(job1Id);

    // 7. Test parity on /api/jobs route
    const jobsRouteRes = await call('GET', '/api/jobs?skills=snowflake');
    expect(jobsRouteRes.status).toBe(200);
    const snowflakeJobs = (jobsRouteRes.body as { total: number; jobs: { id: string; matchedSkills: string[] }[] })
      .jobs;
    expect(snowflakeJobs.length).toBe(1);
    expect(snowflakeJobs[0]!.id).toBe(job3Id);
    expect(snowflakeJobs[0]!.matchedSkills).toContain('Snowflake');
  });
});
