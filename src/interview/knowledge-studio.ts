export type KnowledgeProvenance =
  | 'OFFICIAL_EMPLOYER_DISCLOSURE'
  | 'COMMUNITY_BEST_PRACTICE'
  | 'GENERIC_PRACTICE_FRAMEWORK';

export interface InterviewFormatGuide {
  id: string;
  stageName: string;
  format: 'phone' | 'video' | 'onsite' | 'take_home' | 'other';
  objectives: string[];
  preparationChecklist: string[];
  recommendedStructure: string;
  candidateQuestionsToAsk: string[];
  provenance: KnowledgeProvenance;
}

export interface CompanyResearchGuidance {
  frameworkName: string;
  steps: {
    title: string;
    description: string;
    prompts: string[];
    evidenceSources: string[];
  }[];
}

export interface NegotiationTactic {
  topic: string;
  principle: string;
  recommendedScript: string;
  caveats: string[];
}

export interface VerifiedExternalResource {
  title: string;
  category: 'system_design' | 'coding' | 'behavioral' | 'negotiation' | 'general';
  url: string;
  description: string;
  sourceAttribution: string;
}

export const INTERVIEW_FORMAT_GUIDES: readonly InterviewFormatGuide[] = [
  {
    id: 'recruiter-screen',
    stageName: 'Recruiter & Talent Screen',
    format: 'phone',
    objectives: [
      'Confirm basic eligibility, legal authorization, and notice period.',
      'Assess salary alignment and location requirements.',
      'Evaluate high-level communication and enthusiasm for the problem space.',
    ],
    preparationChecklist: [
      'Have a crisp 90-second "walk through your resume" ready, focusing on recent impact.',
      'Verify the employer’s stated location policy and your work authorization.',
      'Prepare your minimum target compensation based on verified local benchmarks.',
    ],
    recommendedStructure:
      '90-second journey overview → Core accomplishments → Target role alignment → Candidate questions.',
    candidateQuestionsToAsk: [
      'What is driving the need for this role right now (expansion, new initiative, or backfill)?',
      'What are the subsequent stages in your interview process and expected timeline?',
    ],
    provenance: 'GENERIC_PRACTICE_FRAMEWORK',
  },
  {
    id: 'technical-coding',
    stageName: 'Technical Coding & Problem Solving',
    format: 'video',
    objectives: [
      'Demonstrate clean, idiomatically sound code in your strongest language.',
      'Show clear problem decomposition and communication while thinking aloud.',
      'Proactively identify edge cases, time/space complexity, and testing strategies.',
    ],
    preparationChecklist: [
      'Rehearse clarifying requirements and input bounds before writing code.',
      'State your brute-force approach first, then discuss optimization trade-offs.',
      'Walk through tests manually with concrete example inputs before declaring complete.',
    ],
    recommendedStructure:
      'Clarify requirements (3 min) → State approaches & complexities (5 min) → Implement clean code (25 min) → Test & edge cases (10 min).',
    candidateQuestionsToAsk: [
      'How does the engineering team balance test coverage and release velocity in production?',
      'What are the primary build and CI/CD tools used day-to-day?',
    ],
    provenance: 'COMMUNITY_BEST_PRACTICE',
  },
  {
    id: 'system-design',
    stageName: 'System Architecture & Distributed Design',
    format: 'video',
    objectives: [
      'Design reliable, scalable architectures from ambiguous requirements.',
      'Articulate explicit trade-offs (consistency vs availability, throughput vs latency).',
      'Defend data modeling, partitioning, caching, and failure recovery choices.',
    ],
    preparationChecklist: [
      'Scope functional requirements and quantitative constraints (RPS, storage volume).',
      'Sketch high-level API and data schemas before jumping into distributed components.',
      'Deep dive into single points of failure, partition tolerance, and observability.',
    ],
    recommendedStructure:
      'Scope & constraints (5 min) → High-level architecture (10 min) → Deep dive component bottlenecks (20 min) → Scaling & failure modes (10 min).',
    candidateQuestionsToAsk: [
      'What was the most challenging production outage or architectural bottleneck the team tackled recently?',
      'How are major architectural RFCs proposed, reviewed, and decided?',
    ],
    provenance: 'COMMUNITY_BEST_PRACTICE',
  },
  {
    id: 'behavioral-star',
    stageName: 'Behavioral, Leadership & Collaboration',
    format: 'video',
    objectives: [
      'Demonstrate ownership, cross-functional collaboration, and conflict resolution.',
      'Provide structured evidence of learning from failures and ambiguity.',
      'Show alignment with engineering standards, mentorship, and team growth.',
    ],
    preparationChecklist: [
      'Prepare 4–5 core stories mapped to the STAR framework (Situation, Task, Action, Result).',
      'Include quantitative metrics in results (latency reduction, revenue impact, adoption).',
      'Have honest reflections ready on what you would do differently in hindsight.',
    ],
    recommendedStructure:
      'Situation & context (20%) → Action you specifically took (60%) → Measured outcome & learning (20%).',
    candidateQuestionsToAsk: [
      'How does the team handle disagreements between product priorities and technical debt?',
      'What distinguishes engineers who excel in this group from those who struggle?',
    ],
    provenance: 'GENERIC_PRACTICE_FRAMEWORK',
  },
];

export const COMPANY_RESEARCH_GUIDANCE: CompanyResearchGuidance = {
  frameworkName: 'Evidence-Based Company Research Framework',
  steps: [
    {
      title: '1. Business Model & Value Proposition',
      description: 'Understand who pays the company, why they pay, and how the company generates gross margin.',
      prompts: [
        'What core problem does the product solve that customers cannot easily solve with open source or competitors?',
        'Is the business model B2B enterprise subscription, transaction fee, usage-based, or consumer?',
      ],
      evidenceSources: ['Official company about page', 'Product documentation', 'Customer case studies'],
    },
    {
      title: '2. Technology Stack & Technical Challenges',
      description: 'Review observed languages, architectures, and open-source contributions.',
      prompts: [
        'What tech stack is evidenced in their active postings?',
        'Does the engineering organization maintain a public engineering blog or open-source repositories?',
      ],
      evidenceSources: [
        'Verified job postings in this workspace',
        'Company engineering blog',
        'Official GitHub organization',
      ],
    },
    {
      title: '3. Company Stage & Headcount Context',
      description: 'Evaluate organization size, stage maturity, and recent hiring trajectory.',
      prompts: [
        'Is the company early-stage (high ambiguity, generalist expectations) or growth/public (specialization, process)?',
        'Has the team been scaling hiring rapidly or maintaining a steady headcount?',
      ],
      evidenceSources: ['Career Strike Company 360 profile', 'Official funding disclosures'],
    },
    {
      title: '4. Questions to Validate Mutual Fit',
      description: 'Formulate questions that demonstrate rigorous research rather than generic pleasantries.',
      prompts: [
        'Ask about specific technical trade-offs visible in their product architecture.',
        'Inquire about team autonomy, deployment cadence, and product-engineering discovery cycles.',
      ],
      evidenceSources: ['Personal notes and practice sessions'],
    },
  ],
};

export const COMPENSATION_NEGOTIATION_GUIDE: readonly NegotiationTactic[] = [
  {
    topic: '1. Initial Verbal Offer Reception',
    principle:
      'Never accept or counter an offer immediately on the phone. Always express gratitude and request the full breakdown in writing.',
    recommendedScript:
      'Thank you so much for the offer! I am very excited about the mission and the work we discussed. To give this the thoughtful review it deserves, could you send over the complete written offer package including base, variable, equity vesting schedule, and benefits summary? When do you need a decision by?',
    caveats: [
      'Do not give a verbal yes or anchor a counter-figure before inspecting the written document.',
      'Ensure you know the decision deadline.',
    ],
  },
  {
    topic: '2. Anchoring Against Verified Benchmarks',
    principle:
      'Ground counter-proposals in verified local market ranges and your specific demonstrable accomplishments, never personal expenses.',
    recommendedScript:
      'Based on verified market data for senior engineering roles in this region and the specific distributed systems impact I will be driving for this team, I was targeting a base salary of [Target Figure, aligned with P75]. If we can align on that number, I am ready to sign immediately.',
    caveats: [
      'Never cite personal financial needs or cost of living expenses.',
      'Only counter when prepared to accept if the employer meets your terms.',
    ],
  },
  {
    topic: '3. Balancing Equity and Signing Bonuses',
    principle:
      'If base salary is constrained by internal bands, explore one-time signing bonuses or additional equity grants.',
    recommendedScript:
      'I understand that the base salary is at the top of the internal band for this level. Would you have flexibility to bridge the gap through an additional signing bonus or adjusted initial equity grant to make the total first-year compensation competitive?',
    caveats: ['Verify whether equity is ISO/NSO options or RSUs, and review the exercise and vesting terms.'],
  },
];

export const VERIFIED_EXTERNAL_RESOURCES: readonly VerifiedExternalResource[] = [
  {
    title: 'The System Design Primer',
    category: 'system_design',
    url: 'https://github.com/donnemartin/system-design-primer',
    description:
      'Comprehensive, open-source guide to distributed systems, database scaling, caching, and architectural trade-offs.',
    sourceAttribution: 'Donne Martin (Open Source MIT License)',
  },
  {
    title: 'Tech Interview Handbook',
    category: 'coding',
    url: 'https://www.techinterviewhandbook.org/',
    description: 'Curated algorithms roadmap, coding interview rubrics, and behavioral interview prep guide.',
    sourceAttribution: 'Yangshun Tay (Open Source)',
  },
  {
    title: 'Levels.fyi Negotiation Principles Guide',
    category: 'negotiation',
    url: 'https://www.levels.fyi/blog/salary-negotiation.html',
    description: 'Educational articles outlining the stages of corporate tech offer negotiation and equity valuation.',
    sourceAttribution: 'Levels.fyi Educational Resources',
  },
];

export function getInterviewKnowledgeStudio() {
  return {
    formatGuides: INTERVIEW_FORMAT_GUIDES,
    companyResearch: COMPANY_RESEARCH_GUIDANCE,
    negotiationGuide: COMPENSATION_NEGOTIATION_GUIDE,
    externalResources: VERIFIED_EXTERNAL_RESOURCES,
  };
}
