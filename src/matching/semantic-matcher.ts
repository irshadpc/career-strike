import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { calculateSemanticScore } from './embeddings-worker.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(CURRENT_DIR, 'embeddings-worker.js');

let workerInstance: Worker | null = null;
let messageIdCounter = 0;
const pendingRequests = new Map<number, { resolve: (scores: number[]) => void; reject: (err: Error) => void }>();

function getWorker(): Worker | null {
  if (process.env.VITEST) return null; // In vitest/development mode, execute semantic similarity in-process
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(WORKER_PATH);
    workerInstance.on('message', (msg: { id: number; ok: boolean; scores?: number[]; error?: string }) => {
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;
      pendingRequests.delete(msg.id);
      if (msg.ok && msg.scores) {
        pending.resolve(msg.scores);
      } else {
        pending.reject(new Error(msg.error ?? 'Unknown worker error'));
      }
    });
    workerInstance.on('error', (err) => {
      for (const [, pending] of pendingRequests) {
        pending.reject(err);
      }
      pendingRequests.clear();
      workerInstance = null;
    });
    workerInstance.unref(); // Prevent worker from blocking process exit
    return workerInstance;
  } catch {
    // If worker thread cannot be spawned in current environment, fallback to inline execution
    return null;
  }
}

/**
 * Computes semantic similarity between a query and multiple candidates.
 * Offloads computation to a dedicated worker thread to keep the Fastify event loop unblocked.
 */
export async function batchComputeSimilarity(query: string, candidates: string[]): Promise<number[]> {
  if (candidates.length === 0) return [];

  const worker = getWorker();
  if (!worker) {
    // In-process fallback
    return candidates.map((c) => calculateSemanticScore(query, c));
  }

  const id = ++messageIdCounter;
  return new Promise<number[]>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, action: 'similarity', query, candidates });

    // Safety timeout
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        // Fallback to inline
        resolve(candidates.map((c) => calculateSemanticScore(query, c)));
      }
    }, 5000);
  });
}

/**
 * Calculates semantic similarity score between two phrases (0.0 to 1.0).
 */
export async function computeSemanticSimilarity(query: string, candidate: string): Promise<number> {
  const [score] = await batchComputeSimilarity(query, [candidate]);
  return score ?? 0;
}

/**
 * Finds semantic matches among candidates that exceed the similarity threshold (default 0.75).
 */
export async function findSemanticMatches(
  query: string,
  candidates: string[],
  threshold = 0.75,
): Promise<{ text: string; score: number }[]> {
  const scores = await batchComputeSimilarity(query, candidates);
  const matches: { text: string; score: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const score = scores[i] ?? 0;
    if (score >= threshold) {
      matches.push({ text: candidates[i]!, score });
    }
  }
  return matches.sort((a, b) => b.score - a.score);
}
