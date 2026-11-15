import { describe, expect, it } from 'vitest';
import { getInterviewKnowledgeStudio } from '../../src/interview/knowledge-studio.js';

describe('Interview & Career Knowledge Studio', () => {
  it('supplies structured format guides with clear objective and question lists', () => {
    const studio = getInterviewKnowledgeStudio();
    expect(studio.formatGuides.length).toBeGreaterThanOrEqual(4);

    const coding = studio.formatGuides.find((g) => g.id === 'technical-coding');
    expect(coding).toBeDefined();
    expect(coding?.objectives.length).toBeGreaterThan(0);
    expect(coding?.candidateQuestionsToAsk.length).toBeGreaterThan(0);
  });

  it('provides principled compensation negotiation guidance without speculative promises', () => {
    const studio = getInterviewKnowledgeStudio();
    expect(studio.negotiationGuide.length).toBeGreaterThanOrEqual(3);

    const anchorTactic = studio.negotiationGuide.find((t) => t.topic.includes('Anchoring'));
    expect(anchorTactic).toBeDefined();
    expect(anchorTactic?.principle).toContain('verified local market ranges');
    expect(anchorTactic?.caveats[0]).toContain('Never cite personal financial needs');
  });

  it('links to legitimate external resources with clear source attribution', () => {
    const studio = getInterviewKnowledgeStudio();
    expect(studio.externalResources.length).toBeGreaterThanOrEqual(3);

    for (const res of studio.externalResources) {
      expect(res.url).toMatch(/^https:\/\//);
      expect(res.sourceAttribution.length).toBeGreaterThan(0);
    }
  });
});
