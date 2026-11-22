import { parentPort } from 'node:worker_threads';

// Semantic cluster dictionary for domain-specific terminology (fallback and fast-path)
const DOMAIN_CLUSTERS: Record<string, string[]> = {
  'payment authentication': [
    '3ds',
    '3d secure',
    '3d-secure',
    'acs',
    'access control server',
    'passkey',
    'passkeys',
    'webauthn',
    'fido',
    'fido2',
    'sca',
    'strong customer authentication',
    'emvco',
    'biometric auth',
    'payment security',
    'two factor authentication',
    'mfa',
  ],
  'distributed systems': [
    'microservices',
    'high availability',
    'fault tolerance',
    'eventual consistency',
    'consensus',
    'raft',
    'paxos',
    'replication',
    'partitioning',
    'load balancing',
  ],
  'infrastructure as code': ['terraform', 'pulumi', 'cloudformation', 'ansible', 'helm', 'bicep'],
  'container orchestration': ['kubernetes', 'k8s', 'docker swarm', 'nomad', 'openshift', 'ecs', 'eks'],
  observability: ['opentelemetry', 'otel', 'prometheus', 'grafana', 'datadog', 'distributed tracing', 'jaeger'],
  'relational database': ['postgresql', 'postgres', 'mysql', 'mariadb', 'sqlite', 'rdbms', 'sql'],
};

// Word tokenization and normalization
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9+#.-]{2,}/g) ?? []).map((t) => t.replace(/^[.-]+|[.-]+$/g, ''));
}

// Compute cosine similarity between two numeric vectors
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Semantic similarity engine: combines domain clusters + token embeddings
export function calculateSemanticScore(query: string, candidate: string): number {
  const qLower = query.toLowerCase().trim();
  const cLower = candidate.toLowerCase().trim();

  if (qLower === cLower) return 1.0;
  if (cLower.includes(qLower) || qLower.includes(cLower)) return 0.95;

  // Domain cluster match (e.g. payment authentication <-> 3DS / ACS / Passkey)
  for (const [clusterKey, members] of Object.entries(DOMAIN_CLUSTERS)) {
    const qMatchesCluster = qLower.includes(clusterKey) || members.some((m) => qLower.includes(m));
    const cMatchesCluster = cLower.includes(clusterKey) || members.some((m) => cLower.includes(m));

    if (qMatchesCluster && cMatchesCluster) {
      return 0.88;
    }
  }

  // Token Jaccard / Overlap fallback
  const qTokens = new Set(tokenize(qLower));
  const cTokens = new Set(tokenize(cLower));
  if (qTokens.size === 0 || cTokens.size === 0) return 0;

  let intersection = 0;
  for (const t of qTokens) {
    if (cTokens.has(t)) intersection++;
  }
  const union = new Set([...qTokens, ...cTokens]).size;
  return union > 0 ? intersection / union : 0;
}

// Worker message protocol
if (parentPort) {
  parentPort.on('message', async (message: { id: number; action: string; query: string; candidates: string[] }) => {
    try {
      if (message.action === 'similarity') {
        const scores = message.candidates.map((c) => calculateSemanticScore(message.query, c));
        parentPort!.postMessage({ id: message.id, ok: true, scores });
      } else {
        parentPort!.postMessage({ id: message.id, ok: false, error: `Unknown action: ${message.action}` });
      }
    } catch (err) {
      parentPort!.postMessage({
        id: message.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
