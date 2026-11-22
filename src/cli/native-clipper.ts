import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addManualJob } from '../career/jobs.js';
import { appPaths } from '../core/paths.js';
import { VERSION } from '../core/version.js';
import { openDb } from '../store/db.js';

export const CLIPPER_HOST_NAME = 'com.careerstrike.clipper';

export interface ClippedJobInput {
  title: string;
  employer: string;
  location?: string;
  url?: string;
  description?: string;
  remotePolicy?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  source?: string;
}

export interface NativeMessage {
  action: 'ping' | 'clip';
  job?: ClippedJobInput;
}

/**
 * Handles incoming native messaging requests from Chrome/Chromium extensions over stdio.
 */
export async function runNativeMessagingHost(_cliEntry: string): Promise<void> {
  const paths = appPaths();

  function writeMessage(msg: Record<string, unknown>): void {
    const json = Buffer.from(JSON.stringify(msg), 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(json.length, 0);
    process.stdout.write(header);
    process.stdout.write(json);
  }

  process.stdin.on('readable', () => {
    let chunk: Buffer | null = process.stdin.read(4);
    while (chunk !== null) {
      if (chunk.length < 4) break;
      const length = chunk.readUInt32LE(0);
      const msgBuffer = process.stdin.read(length);
      if (!msgBuffer) break;

      try {
        const raw = JSON.parse(msgBuffer.toString('utf8')) as NativeMessage;
        if (raw.action === 'ping') {
          writeMessage({ status: 'ok', service: 'career-strike', version: VERSION });
          chunk = process.stdin.read(4);
          continue;
        }

        if (raw.action === 'clip' && raw.job) {
          const job = raw.job;
          if (!job.title || !job.employer) {
            writeMessage({ ok: false, error: 'Title and employer are required.' });
            chunk = process.stdin.read(4);
            continue;
          }

          const db = openDb(paths.db);
          try {
            const jobId = addManualJob(db, {
              title: job.title.trim(),
              employer: job.employer.trim(),
              location: job.location?.trim() || '',
              url: job.url?.trim() || '',
              remotePolicy: job.remotePolicy ?? 'unknown',
              description: job.description?.trim() || '',
            });

            // Associate with source board
            const source = job.source || 'chrome-clipper';
            const at = new Date().toISOString();
            db.prepare(
              `INSERT OR REPLACE INTO job_sources (job_id, source, board, source_job_id, source_url, fetched_at, content_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(jobId, source, 'clipper', jobId, job.url || null, at, `clip-${jobId}`);

            writeMessage({ ok: true, jobId, message: `Clipped "${job.title}" at ${job.employer}.` });
          } finally {
            db.close();
          }
          chunk = process.stdin.read(4);
          continue;
        }

        writeMessage({ ok: false, error: `Unknown action: ${raw.action}` });
      } catch (err) {
        writeMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      chunk = process.stdin.read(4);
    }
  });
}

/**
 * Returns the directories where Chrome Native Messaging Host manifests are installed.
 */
export function getNativeManifestDirs(): string[] {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return [
      path.join(home, 'Library/Application Support/Google/Chrome/NativeMessagingHosts'),
      path.join(home, 'Library/Application Support/Chromium/NativeMessagingHosts'),
      path.join(home, 'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts'),
    ];
  }
  if (process.platform === 'win32') {
    return [path.join(process.env.LOCALAPPDATA || home, 'Google/Chrome/User Data/NativeMessagingHosts')];
  }
  return [
    path.join(home, '.config/google-chrome/NativeMessagingHosts'),
    path.join(home, '.config/chromium/NativeMessagingHosts'),
    path.join(home, '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts'),
  ];
}

/**
 * Installs the Native Messaging host JSON manifest so Chrome can launch career-strike.
 */
export function installNativeManifest(nodePath: string, cliPath: string): string[] {
  const manifest = {
    name: CLIPPER_HOST_NAME,
    description: 'Career Strike Job Clipper Native Messaging Host',
    path: cliPath.endsWith('.js') || cliPath.endsWith('.ts') ? nodePath : cliPath,
    type: 'stdio',
    allowed_origins: [
      'chrome-extension://*/*',
      'chrome-extension://knldjmfmopnplhpdelcoocicmopkggdg/', // standard clipper extension id
    ],
  };

  const dirs = getNativeManifestDirs();
  const installed: string[] = [];

  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, `${CLIPPER_HOST_NAME}.json`);
      fs.writeFileSync(target, JSON.stringify(manifest, null, 2), { mode: 0o644 });
      installed.push(target);
    } catch {
      /* ignore if specific browser is not installed */
    }
  }

  return installed;
}
