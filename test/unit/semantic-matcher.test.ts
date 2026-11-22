import { describe, expect, it } from 'vitest';
import { calculateSemanticScore } from '../../src/matching/embeddings-worker.js';
import {
  batchComputeSimilarity,
  computeSemanticSimilarity,
  findSemanticMatches,
} from '../../src/matching/semantic-matcher.js';

describe('local semantic matcher & ONNX embeddings', () => {
  it('identifies exact matches with score 1.0', () => {
    expect(calculateSemanticScore('TypeScript', 'TypeScript')).toBe(1.0);
  });

  it('fixes semantic misses by matching payment authentication with 3DS, ACS, and Passkey', async () => {
    const score3ds = calculateSemanticScore('payment authentication', 'Experience with 3DS payment verification');
    expect(score3ds).toBeGreaterThanOrEqual(0.85);

    const scoreAcs = calculateSemanticScore('payment authentication', 'ACS (Access Control Server) integrations');
    expect(scoreAcs).toBeGreaterThanOrEqual(0.85);

    const scorePasskey = calculateSemanticScore('payment authentication', 'Passkey biometric authentication flows');
    expect(scorePasskey).toBeGreaterThanOrEqual(0.85);
  });

  it('computes batch similarity across candidates without blocking', async () => {
    const query = 'container orchestration';
    const candidates = ['Kubernetes cluster management', 'Docker Swarm deployment', 'Writing CSS layouts'];
    const scores = await batchComputeSimilarity(query, candidates);
    expect(scores.length).toBe(3);
    expect(scores[0]).toBeGreaterThanOrEqual(0.8);
    expect(scores[1]).toBeGreaterThanOrEqual(0.8);
    expect(scores[2]).toBeLessThan(0.3);
  });

  it('finds top semantic matches above threshold', async () => {
    const query = 'observability';
    const candidates = ['OpenTelemetry instrumentation', 'Grafana dashboard alerting', 'Baking bread'];
    const simSingle = await computeSemanticSimilarity('observability', 'OpenTelemetry instrumentation');
    expect(simSingle).toBeGreaterThanOrEqual(0.7);
    const matches = await findSemanticMatches(query, candidates, 0.7);
    expect(matches.length).toBe(2);
    expect(matches.map((m) => m.text)).toContain('OpenTelemetry instrumentation');
    expect(matches.map((m) => m.text)).toContain('Grafana dashboard alerting');
  });
});
