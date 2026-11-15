import { describe, expect, it } from 'vitest';
import {
  createCustomCollection,
  getCuratedCollection,
  listCuratedCollections,
  SYSTEM_COLLECTIONS,
} from '../../src/career/collections.js';
import { syncBoard } from '../../src/career/jobs.js';
import { upsertCompany360 } from '../../src/markets/company-intelligence.js';
import { addCandidateCompany } from '../../src/markets/company-registry.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';

describe('Curated Career Collections Engine', () => {
  it('initializes standard system collections with honest explainability', () => {
    const db = openDb(':memory:');
    const collections = listCuratedCollections(db);
    expect(collections.length).toBeGreaterThanOrEqual(SYSTEM_COLLECTIONS.length);

    const aiCol = collections.find((c) => c.ruleKind === 'AI_EMERGING');
    expect(aiCol).toBeDefined();
    expect(aiCol?.title).toContain('AI');
    expect(aiCol?.isCustom).toBe(false);
  });

  it('dynamically matches companies and jobs based on verified attributes', () => {
    const db = openDb(':memory:');
    const comp = addCandidateCompany(db, { name: 'Cognitive Matrix AI' });
    upsertCompany360(db, comp.id, {
      industry: 'Artificial Intelligence',
      productDomain: 'Foundation Model Research',
      stage: 'SERIES_A',
      techStack: ['PyTorch', 'CUDA'],
    });

    const posting: NormalizedPosting = {
      source: 'lever',
      board: 'cognitive-matrix',
      sourceJobId: 'job-1',
      employer: 'Cognitive Matrix AI',
      title: 'Senior LLM Research Scientist',
      locationText: 'Remote',
      remotePolicy: 'remote',
      employmentType: 'full_time',
      department: 'Research',
      salary: null,
      description: [{ type: 'paragraph', text: 'Training foundation models' }],
      applyUrl: null,
      postingUrl: 'https://example.com/job1',
      publishedAt: new Date().toISOString(),
      unresolved: [],
    };

    syncBoard(db, 'lever', 'cognitive-matrix', [posting]);

    const detail = getCuratedCollection(db, 'emerging-ai-companies');
    expect(detail).not.toBeNull();
    expect(detail?.companyCount).toBeGreaterThanOrEqual(1);
    expect(detail?.companies.some((c) => c.name === 'Cognitive Matrix AI')).toBe(true);
    expect(detail?.sampleRoles.some((r) => r.title === 'Senior LLM Research Scientist')).toBe(true);
  });

  it('allows candidate to create custom collections and filters them', () => {
    const db = openDb(':memory:');
    const created = createCustomCollection(db, {
      title: 'Robotics Startups',
      description: 'Robotics and physical automation',
      badge: 'Robotics',
      query: 'robotics',
    });

    expect(created.isCustom).toBe(true);
    expect(created.ruleKind).toBe('CUSTOM_FILTER');

    const list = listCuratedCollections(db);
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });
});
