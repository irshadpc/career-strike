import type { Db } from '../store/db.js';

export interface ExtractedSkill {
  slug: string;
  label: string;
}

interface SkillDefinition {
  slug: string;
  label: string;
  match: (text: string) => boolean;
}

/**
 * Builds a regex that matches any of the given literal tokens with word/symbol boundaries.
 * Correctly handles symbols like C++, C#, .NET, Node.js, and CI/CD.
 */
function makeBoundaryRegex(tokens: readonly string[], caseInsensitive = true): RegExp {
  const parts = tokens.map((t) => {
    // If the token starts or ends with non-word characters, adjust boundary
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startBoundary = /^\w/.test(t) ? '\\b' : '(?:^|[\\s,;/()\\[\\]\\.\\-&:])';
    const endBoundary = /\w$/.test(t) ? '\\b' : '(?=$|[\\s,;/()\\[\\]\\.\\-&:])';
    return `${startBoundary}${escaped}${endBoundary}`;
  });
  return new RegExp(parts.join('|'), caseInsensitive ? 'i' : '');
}

/**
 * Specialized matcher for Go (Golang) to prevent false positives:
 * - "golang" always matches
 * - "go programming", "go developer", "go engineer", "go backend", "go code"
 * - In programming lists: e.g. "Python, Go, Rust", "Go, Java, C++"
 * - Capitalized standalone "Go" in tech requirement lists
 * Never matches ordinary words: "good", "gold", "going", "category", "go to", "go-to-market".
 */
function matchGoLanguage(text: string): boolean {
  if (/\bgolang\b/i.test(text)) return true;
  if (
    /\bgo\s+(?:programming|language|developer|engineer|programmer|backend|service|microservices?|codebase|code)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(?:python|rust|java|c\+\+|c#|typescript|javascript|ruby|php|kotlin|swift|scala)\s*,\s*go\b/i.test(text)) {
    return true;
  }
  if (/\bgo\s*,\s*(?:python|rust|java|c\+\+|c#|typescript|javascript|ruby|php|kotlin|swift|scala)\b/i.test(text)) {
    return true;
  }
  // Standalone uppercase "Go" in lists or parenthesis, not followed by English prepositions/adverbs
  const standaloneGo = /(?:^|[\s,;/()[\]])Go(?:$|[\s,;/()[\]])/;
  if (standaloneGo.test(text)) {
    // Ensure it's not "Go to", "Go-to-market", "Go live"
    if (
      !/\bGo[- ]to[- ]market\b/i.test(text) &&
      !/\bGo\s+(?:to|live|ahead|through|into|out|away|deep|with|for|under|over)\b/i.test(text)
    ) {
      // Must be accompanied by general tech context if only capitalized "Go"
      if (/\b(?:software|engineer|developer|backend|stack|code|systems?|programming|api)\b/i.test(text)) {
        return true;
      }
    }
  }
  return false;
}

export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  // --- Languages ---
  {
    slug: 'typescript',
    label: 'TypeScript',
    match: (t) => makeBoundaryRegex(['typescript', 'ts']).test(t),
  },
  {
    slug: 'javascript',
    label: 'JavaScript',
    match: (t) =>
      makeBoundaryRegex(['javascript', 'ecmascript']).test(t) || /(?<!node\.|next\.|nuxt\.|vue\.)\bjs\b/i.test(t),
  },
  {
    slug: 'python',
    label: 'Python',
    match: (t) => makeBoundaryRegex(['python', 'python3', 'py3']).test(t),
  },
  {
    slug: 'golang',
    label: 'Go',
    match: matchGoLanguage,
  },
  {
    slug: 'rust',
    label: 'Rust',
    match: (t) => makeBoundaryRegex(['rust', 'rustlang']).test(t),
  },
  {
    slug: 'java',
    label: 'Java',
    match: (t) => /\bjava\b/i.test(t) && !/\bjavascript\b/i.test(t),
  },
  {
    slug: 'csharp',
    label: 'C#',
    match: (t) => makeBoundaryRegex(['c#', 'csharp', '.net', 'dotnet']).test(t),
  },
  {
    slug: 'cpp',
    label: 'C++',
    match: (t) => makeBoundaryRegex(['c++', 'cpp']).test(t),
  },
  {
    slug: 'php',
    label: 'PHP',
    match: (t) => makeBoundaryRegex(['php']).test(t),
  },
  {
    slug: 'ruby',
    label: 'Ruby',
    match: (t) => makeBoundaryRegex(['ruby', 'ruby on rails', 'rails']).test(t),
  },
  {
    slug: 'swift',
    label: 'Swift',
    match: (t) => makeBoundaryRegex(['swift', 'swiftui']).test(t),
  },
  {
    slug: 'kotlin',
    label: 'Kotlin',
    match: (t) => makeBoundaryRegex(['kotlin']).test(t),
  },
  {
    slug: 'sql',
    label: 'SQL',
    match: (t) => makeBoundaryRegex(['sql', 'mysql', 'sqlite', 't-sql', 'pl/sql']).test(t),
  },

  // --- Frontend & UI ---
  {
    slug: 'react',
    label: 'React',
    match: (t) => makeBoundaryRegex(['react', 'reactjs', 'react.js', 'react native']).test(t),
  },
  {
    slug: 'nextjs',
    label: 'Next.js',
    match: (t) => makeBoundaryRegex(['next.js', 'nextjs']).test(t),
  },
  {
    slug: 'vue',
    label: 'Vue',
    match: (t) => makeBoundaryRegex(['vue', 'vue.js', 'vuejs', 'nuxt', 'nuxtjs']).test(t),
  },
  {
    slug: 'angular',
    label: 'Angular',
    match: (t) => makeBoundaryRegex(['angular', 'angularjs']).test(t),
  },
  {
    slug: 'tailwind',
    label: 'Tailwind CSS',
    match: (t) => makeBoundaryRegex(['tailwind', 'tailwindcss']).test(t),
  },
  {
    slug: 'html_css',
    label: 'HTML/CSS',
    match: (t) => makeBoundaryRegex(['html', 'html5', 'css', 'css3']).test(t),
  },

  // --- Backend & Frameworks ---
  {
    slug: 'nodejs',
    label: 'Node.js',
    match: (t) => makeBoundaryRegex(['node.js', 'nodejs', 'node']).test(t),
  },
  {
    slug: 'graphql',
    label: 'GraphQL',
    match: (t) => makeBoundaryRegex(['graphql', 'gql']).test(t),
  },
  {
    slug: 'fastapi',
    label: 'FastAPI',
    match: (t) => makeBoundaryRegex(['fastapi']).test(t),
  },
  {
    slug: 'django',
    label: 'Django',
    match: (t) => makeBoundaryRegex(['django']).test(t),
  },
  {
    slug: 'flask',
    label: 'Flask',
    match: (t) => makeBoundaryRegex(['flask']).test(t),
  },
  {
    slug: 'spring',
    label: 'Spring Boot',
    match: (t) => makeBoundaryRegex(['spring boot', 'spring framework']).test(t),
  },
  {
    slug: 'system_design',
    label: 'System Design',
    match: (t) => makeBoundaryRegex(['system design', 'distributed systems', 'microservices']).test(t),
  },

  // --- Data & Storage ---
  {
    slug: 'postgresql',
    label: 'PostgreSQL',
    match: (t) => makeBoundaryRegex(['postgresql', 'postgres', 'psql']).test(t),
  },
  {
    slug: 'mongodb',
    label: 'MongoDB',
    match: (t) => makeBoundaryRegex(['mongodb', 'mongo']).test(t),
  },
  {
    slug: 'redis',
    label: 'Redis',
    match: (t) => makeBoundaryRegex(['redis']).test(t),
  },
  {
    slug: 'kafka',
    label: 'Kafka',
    match: (t) => makeBoundaryRegex(['kafka', 'apache kafka']).test(t),
  },
  {
    slug: 'elasticsearch',
    label: 'Elasticsearch',
    match: (t) => makeBoundaryRegex(['elasticsearch', 'opensearch']).test(t),
  },
  {
    slug: 'snowflake',
    label: 'Snowflake',
    match: (t) => makeBoundaryRegex(['snowflake']).test(t),
  },
  {
    slug: 'data_engineering',
    label: 'Data Engineering',
    match: (t) =>
      makeBoundaryRegex(['data engineering', 'etl', 'elt', 'spark', 'pyspark', 'databricks', 'dbt', 'bigquery']).test(
        t,
      ),
  },

  // --- Cloud, Containers & Infra ---
  {
    slug: 'kubernetes',
    label: 'Kubernetes',
    match: (t) => makeBoundaryRegex(['kubernetes', 'k8s', 'kube']).test(t),
  },
  {
    slug: 'docker',
    label: 'Docker',
    match: (t) => makeBoundaryRegex(['docker', 'containerization', 'containers']).test(t),
  },
  {
    slug: 'aws',
    label: 'AWS',
    match: (t) => makeBoundaryRegex(['aws', 'amazon web services']).test(t),
  },
  {
    slug: 'gcp',
    label: 'GCP',
    match: (t) => makeBoundaryRegex(['gcp', 'google cloud', 'google cloud platform']).test(t),
  },
  {
    slug: 'azure',
    label: 'Azure',
    match: (t) => makeBoundaryRegex(['azure', 'microsoft azure']).test(t),
  },
  {
    slug: 'terraform',
    label: 'Terraform',
    match: (t) => makeBoundaryRegex(['terraform', 'opentofu']).test(t),
  },
  {
    slug: 'ci_cd',
    label: 'CI/CD',
    match: (t) => makeBoundaryRegex(['ci/cd', 'cicd', 'github actions', 'gitlab ci', 'jenkins']).test(t),
  },
  {
    slug: 'linux',
    label: 'Linux',
    match: (t) => makeBoundaryRegex(['linux', 'unix', 'bash', 'shell scripting']).test(t),
  },
  {
    slug: 'git',
    label: 'Git',
    match: (t) => makeBoundaryRegex(['git', 'github', 'gitlab']).test(t),
  },

  // --- AI & Machine Learning ---
  {
    slug: 'machine_learning',
    label: 'Machine Learning',
    match: (t) => makeBoundaryRegex(['machine learning', 'deep learning', 'ml', 'artificial intelligence']).test(t),
  },
  {
    slug: 'llm',
    label: 'LLMs / GenAI',
    match: (t) =>
      makeBoundaryRegex([
        'llm',
        'llms',
        'large language models',
        'genai',
        'generative ai',
        'langchain',
        'rag',
        'prompt engineering',
      ]).test(t),
  },
  {
    slug: 'pytorch',
    label: 'PyTorch',
    match: (t) => makeBoundaryRegex(['pytorch', 'torch']).test(t),
  },
  {
    slug: 'tensorflow',
    label: 'TensorFlow',
    match: (t) => makeBoundaryRegex(['tensorflow']).test(t),
  },

  // --- Product, Domain & Security ---
  {
    slug: 'product_management',
    label: 'Product Management',
    match: (t) =>
      makeBoundaryRegex(['product management', 'product manager', 'pm', 'product roadmap', 'scrum', 'agile']).test(t),
  },
  {
    slug: 'payments',
    label: 'Payments',
    match: (t) => makeBoundaryRegex(['payments', 'payment processing', 'fintech', 'stripe', 'billing']).test(t),
  },
  {
    slug: 'security',
    label: 'Security',
    match: (t) =>
      makeBoundaryRegex([
        'security',
        'cybersecurity',
        'infosec',
        'application security',
        'appsec',
        'soc 2',
        'iso 27001',
      ]).test(t),
  },
  {
    slug: 'passkey',
    label: 'Passkeys / Auth',
    match: (t) =>
      makeBoundaryRegex(['passkey', 'passkeys', 'webauthn', 'fido2', 'oauth', 'sso', 'authentication', 'saml']).test(t),
  },
  {
    slug: 'testing',
    label: 'Testing / QA',
    match: (t) =>
      makeBoundaryRegex([
        'testing',
        'unit testing',
        'integration testing',
        'playwright',
        'cypress',
        'jest',
        'vitest',
        'selenium',
        'qa',
      ]).test(t),
  },
];

/**
 * Extracts canonical skills from a job's title and description text.
 */
export function extractSkills(title: string, description: string): ExtractedSkill[] {
  const combined = `${title}\n${description}`;
  const matched: ExtractedSkill[] = [];
  for (const def of SKILL_DEFINITIONS) {
    if (def.match(combined)) {
      matched.push({ slug: def.slug, label: def.label });
    }
  }
  return matched;
}

/**
 * Persists extracted skills for a specific job into SQLite `job_skills`.
 */
export function syncJobSkills(db: Db, jobId: string, title: string, description: string): ExtractedSkill[] {
  const skills = extractSkills(title, description);
  const deleteExisting = db.prepare('DELETE FROM job_skills WHERE job_id = ?');
  const insertSkill = db.prepare('INSERT OR IGNORE INTO job_skills (job_id, skill_slug, skill_label) VALUES (?, ?, ?)');

  db.transaction(() => {
    deleteExisting.run(jobId);
    for (const skill of skills) {
      insertSkill.run(jobId, skill.slug, skill.label);
    }
  })();

  return skills;
}

/**
 * Lists top extracted skill facets across currently synced active jobs,
 * respecting optional country, remote, and text query filters.
 */
export function listSkillFacets(
  db: Db,
  filters?: { country?: string; remote?: string; q?: string },
): { slug: string; label: string; count: number }[] {
  const where: string[] = ["j.status IN ('OPEN', 'UNVERIFIED')"];
  const params: Record<string, unknown> = {};

  if (filters?.country) {
    where.push('(j.country_code = @country OR j.country_codes_json LIKE @countryLike)');
    params.country = filters.country.toUpperCase();
    params.countryLike = `%"${filters.country.toUpperCase()}"%`;
  }

  if (filters?.remote) {
    where.push('(j.remote_policy = @remote OR j.work_mode = @remote)');
    params.remote = filters.remote;
  }

  if (filters?.q) {
    filters.q
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5)
      .forEach((term, i) => {
        where.push(`(j.title LIKE @q${i} ESCAPE '\\' OR j.employer LIKE @q${i} ESCAPE '\\')`);
        params[`q${i}`] = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      });
  }

  const query = `
    SELECT js.skill_slug AS slug, js.skill_label AS label, COUNT(DISTINCT js.job_id) AS count
    FROM job_skills js
    JOIN jobs j ON j.id = js.job_id
    WHERE ${where.join(' AND ')}
    GROUP BY js.skill_slug, js.skill_label
    ORDER BY count DESC, label ASC
    LIMIT 100
  `;

  return db.prepare(query).all(params) as { slug: string; label: string; count: number }[];
}

/**
 * Backfills `job_skills` for any existing job in SQLite that has no skill entries.
 * Idempotent, safe to run at startup.
 */
export function backfillJobSkills(db: Db): { backfilledCount: number } {
  // Check if job_skills table exists
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'job_skills'").get();
  if (!tableCheck) return { backfilledCount: 0 };

  const unindexedJobs = db
    .prepare(`
      SELECT j.id, j.title, j.description_text
      FROM jobs j
      LEFT JOIN job_skills js ON js.job_id = j.id
      WHERE js.job_id IS NULL
    `)
    .all() as { id: string; title: string; description_text: string | null }[];

  if (unindexedJobs.length === 0) return { backfilledCount: 0 };

  const insertSkill = db.prepare('INSERT OR IGNORE INTO job_skills (job_id, skill_slug, skill_label) VALUES (?, ?, ?)');

  db.transaction(() => {
    for (const job of unindexedJobs) {
      const skills = extractSkills(job.title, job.description_text ?? '');
      for (const skill of skills) {
        insertSkill.run(job.id, skill.slug, skill.label);
      }
    }
  })();

  return { backfilledCount: unindexedJobs.length };
}
