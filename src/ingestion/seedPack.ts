import type { Discovery, SourceBoard } from '../career/discovery.js';
import type { SourceId } from '../sources/types.js';
import type { Db } from '../store/db.js';

/**
 * Default multi-country board pack (resume-studio audit Step 2).
 *
 * A fresh local install immediately monitors 21 verified company boards across Greenhouse, Lever
 * and Ashby with hiring presence in the US, India, the UK, Germany/EU, Singapore, Australia and
 * worldwide-remote, plus the two keyless global feeds (Remotive, Arbeitnow).
 *
 * Every slug was verified live (HTTP 200 with a non-empty listing) before being committed:
 *   greenhouse: stripe 773, anthropic 637, databricks 898, coinbase 253, twilio 106, sumup 311,
 *   newrelic 42, figma 146, monzo 59, cultureamp 32, deliveroo 190, wise 18, agoda 347
 *   lever: saviynt, ninjavan 137, mable 13
 *   ashby: sarvam 44, harvey 388, elevenlabs 125, ziina 12
 *   remotive 15, arbeitnow 300
 */

export interface SeedBoard {
  source: Extract<SourceId, 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'remotive' | 'arbeitnow'>;
  board: string;
  label: string;
  countries: string[];
}

export const SEED_PACK: readonly SeedBoard[] = [
  { source: 'greenhouse', board: 'stripe', label: 'Stripe', countries: ['US', 'GB', 'SG'] },
  { source: 'greenhouse', board: 'anthropic', label: 'Anthropic', countries: ['US'] },
  { source: 'greenhouse', board: 'databricks', label: 'Databricks', countries: ['US', 'IN', 'NL'] },
  { source: 'greenhouse', board: 'coinbase', label: 'Coinbase', countries: ['US', 'GB'] },
  { source: 'greenhouse', board: 'twilio', label: 'Twilio', countries: ['US', 'IE'] },
  { source: 'greenhouse', board: 'sumup', label: 'SumUp', countries: ['DE', 'GB', 'BR'] },
  { source: 'greenhouse', board: 'newrelic', label: 'New Relic', countries: ['US', 'IN', 'NZ'] },
  { source: 'greenhouse', board: 'figma', label: 'Figma', countries: ['US'] },
  { source: 'greenhouse', board: 'monzo', label: 'Monzo', countries: ['GB'] },
  { source: 'greenhouse', board: 'cultureamp', label: 'Culture Amp', countries: ['AU', 'GB', 'US'] },
  { source: 'greenhouse', board: 'deliveroo', label: 'Deliveroo', countries: ['GB', 'NL', 'FR', 'BE'] },
  { source: 'greenhouse', board: 'wise', label: 'Wise', countries: ['GB', 'BE', 'SG'] },
  { source: 'greenhouse', board: 'agoda', label: 'Agoda', countries: ['SG', 'TH'] },
  { source: 'lever', board: 'saviynt', label: 'Saviynt', countries: ['IN'] },
  { source: 'lever', board: 'ninjavan', label: 'Ninja Van', countries: ['SG', 'ID', 'MY', 'PH', 'VN'] },
  { source: 'lever', board: 'mable', label: 'Mable', countries: ['AU'] },
  { source: 'ashby', board: 'sarvam', label: 'Sarvam AI', countries: ['IN'] },
  { source: 'ashby', board: 'harvey', label: 'Harvey', countries: ['US', 'IN', 'GB'] },
  { source: 'ashby', board: 'elevenlabs', label: 'ElevenLabs', countries: ['GB', 'US', 'PL'] },
  { source: 'ashby', board: 'ziina', label: 'Ziina', countries: ['AE'] },
  { source: 'smartrecruiters', board: 'BoschGroup', label: 'Bosch Group', countries: ['DE', 'IN', 'US', 'GB'] },
  { source: 'smartrecruiters', board: 'ServiceNow', label: 'ServiceNow', countries: ['US', 'IN', 'GB', 'IE', 'NL'] },
  { source: 'smartrecruiters', board: 'Eurofins', label: 'Eurofins', countries: ['US', 'IN', 'GB', 'DE', 'FR'] },
  { source: 'smartrecruiters', board: 'Experian', label: 'Experian', countries: ['US', 'IN', 'GB'] },
  { source: 'remotive', board: 'remotive', label: 'Remotive (global remote)', countries: ['GLOBAL'] },
  { source: 'arbeitnow', board: 'arbeitnow', label: 'Arbeitnow (DE/EU)', countries: ['DE', 'GLOBAL'] },
];

/** Add every pack board the install is not monitoring yet. Returns the newly added board ids. */
export function ensureSeedBoards(db: Db, discovery: Discovery): SourceBoard[] {
  const known = new Set(
    db.prepare("SELECT source || '/' || board AS key FROM source_boards").pluck().all() as string[],
  );
  const added: SourceBoard[] = [];
  for (const seed of SEED_PACK) {
    const key = `${seed.source}/${seed.board}`;
    if (known.has(key)) continue;
    try {
      added.push(discovery.addBoard(seed.source, seed.board));
    } catch {
      // A duplicate from a concurrent writer is fine; anything else still must not block startup.
    }
  }
  return added;
}

/** Seed the pack and fetch each newly added board with polite concurrency (max 4 in flight). */
export function seedAndDiscoverBoards(
  db: Db,
  discovery: Discovery,
  logger: { info?: (event: string, data?: Record<string, unknown>) => void } = {},
): { added: number; started: string[] } {
  const added = ensureSeedBoards(db, discovery);
  const started: string[] = [];
  const pending = added.map((b) => b.id);
  const CONCURRENCY = 4;
  const running = (id: string): boolean => {
    if (!db.open) return false;
    try {
      const state = discovery.taskState(id);
      return state === 'RUNNING' || state === 'QUEUED';
    } catch {
      return false;
    }
  };
  const runningCount = (): number => (db.open ? started.filter(running).length : 0);
  const launch = (): number => {
    if (!db.open) return 0;
    let launched = 0;
    while (runningCount() < CONCURRENCY && pending.length > 0) {
      const boardId = pending.shift()!;
      const run = discovery.discover(boardId, 'seed-pack', 'startup');
      if (run?.created) {
        started.push(run.task.id);
        launched += 1;
      }
    }
    return launched;
  };
  launch();
  if (pending.length > 0) {
    const refill = setInterval(() => {
      try {
        if (!db.open) {
          clearInterval(refill);
          return;
        }
        if (runningCount() >= CONCURRENCY) return;
        launch();
        if (pending.length === 0 && runningCount() === 0) clearInterval(refill);
      } catch {
        clearInterval(refill);
      }
    }, 5_000);
    refill.unref();
  }
  logger.info?.('seed-pack.started', { added: added.length, started: started.length });
  return { added: added.length, started };
}
