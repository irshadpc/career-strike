import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Operating-system scheduling. The app's in-process scheduler only runs while the service is
 * running; these helpers register a per-user OS job that invokes `career-strike run-scheduled`
 * even when the dashboard is closed. Nothing here starts the dashboard or an HTTP listener.
 *
 * Every function accepts an injectable platform, home directory and command runner so the
 * generated job files and commands can be tested without touching the real user session.
 */

export type SchedulePlatform = 'darwin' | 'linux' | 'win32';
export type CommandRunner = (file: string, args: readonly string[]) => void;

export interface ScheduleOptions {
  platform?: SchedulePlatform;
  homedir?: string;
  nodePath: string;
  cliPath: string;
  intervalHours: number;
  careerStrikeHome?: string | null;
  uid?: number;
  run?: CommandRunner;
}

export interface ScheduleInstallResult {
  platform: SchedulePlatform;
  files: string[];
  commands: { file: string; args: string[] }[];
  intervalHours: number;
}

export interface ScheduleStatus {
  platform: SchedulePlatform;
  installed: boolean;
  files: { path: string; exists: boolean }[];
  intervalHours: number | null;
  detail: string;
}

const LABEL = 'ai.careerstrike.discovery';
const WINDOWS_TASK = 'CareerStrikeDiscovery';

const defaultRun: CommandRunner = (file, args) => {
  try {
    execFileSync(file, [...args], { stdio: 'ignore' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`The scheduling command failed (${file} ${args.join(' ')}): ${message}`);
  }
};

function platformOf(value?: SchedulePlatform): SchedulePlatform {
  const platform = value ?? process.platform;
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32')
    throw new Error(
      `OS scheduling is not supported on ${platform}. Use \`career-strike run-scheduled\` from your own scheduler.`,
    );
  return platform;
}

function validateHours(hours: number): number {
  if (!Number.isInteger(hours) || hours < 1 || hours > 168)
    throw new Error('Choose an interval between 1 and 168 hours.');
  return hours;
}

const xml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const shellQuote = (text: string): string => `"${text.replace(/"/g, '\\"')}"`;

export function schedulePaths(
  platform: SchedulePlatform,
  homedir: string,
): { files: string[]; label: string; windowsTask: string } {
  if (platform === 'darwin') {
    return {
      files: [path.join(homedir, 'Library', 'LaunchAgents', `${LABEL}.plist`)],
      label: LABEL,
      windowsTask: WINDOWS_TASK,
    };
  }
  if (platform === 'linux') {
    const dir = path.join(homedir, '.config', 'systemd', 'user');
    return {
      files: [path.join(dir, 'career-strike-discovery.service'), path.join(dir, 'career-strike-discovery.timer')],
      label: 'career-strike-discovery',
      windowsTask: WINDOWS_TASK,
    };
  }
  return { files: [], label: LABEL, windowsTask: WINDOWS_TASK };
}

function darwinPlist(
  opts: Required<Pick<ScheduleOptions, 'nodePath' | 'cliPath' | 'intervalHours'>> & {
    home: string;
    careerStrikeHome: string | null;
  },
): string {
  const logs = path.join(opts.home, 'logs');
  const env = opts.careerStrikeHome
    ? `<key>EnvironmentVariables</key><dict><key>CAREER_STRIKE_HOME</key><string>${xml(opts.careerStrikeHome)}</string></dict>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array>
<string>${xml(opts.nodePath)}</string>
<string>${xml(opts.cliPath)}</string>
<string>run-scheduled</string>
<string>--interval</string>
<string>${opts.intervalHours}</string>
</array>
${env}
<key>StartInterval</key><integer>${opts.intervalHours * 3600}</integer>
<key>RunAtLoad</key><false/>
<key>StandardOutPath</key><string>${xml(path.join(logs, 'scheduled.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, 'scheduled.log'))}</string>
</dict></plist>
`;
}

function systemdService(opts: {
  nodePath: string;
  cliPath: string;
  intervalHours: number;
  careerStrikeHome: string | null;
}): string {
  const env = opts.careerStrikeHome ? `Environment=${shellQuote(`CAREER_STRIKE_HOME=${opts.careerStrikeHome}`)}\n` : '';
  return `[Unit]
Description=Career Strike scheduled job-board discovery
Documentation=file://${opts.cliPath}

[Service]
Type=oneshot
ExecStart=${shellQuote(opts.nodePath)} ${shellQuote(opts.cliPath)} run-scheduled --interval ${opts.intervalHours}
${env}Nice=10

[Install]
WantedBy=default.target
`;
}

function systemdTimer(intervalHours: number): string {
  const calendar = intervalHours === 24 ? 'daily' : `*-*-* 00/${intervalHours}:00:00`;
  return `[Unit]
Description=Run Career Strike scheduled discovery every ${intervalHours} hour${intervalHours === 1 ? '' : 's'}

[Timer]
OnCalendar=${calendar}
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
`;
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode: 0o644 });
}

export function installSchedule(options: ScheduleOptions): ScheduleInstallResult {
  const platform = platformOf(options.platform);
  const homedir = options.homedir ?? os.homedir();
  const intervalHours = validateHours(options.intervalHours);
  const run = options.run ?? defaultRun;
  const paths = schedulePaths(platform, homedir);
  const commands: { file: string; args: string[] }[] = [];

  if (platform === 'darwin') {
    const file = paths.files[0]!;
    writeFile(
      file,
      darwinPlist({
        nodePath: options.nodePath,
        cliPath: options.cliPath,
        intervalHours,
        home: homedir,
        careerStrikeHome: options.careerStrikeHome ?? null,
      }),
    );
    const uid = options.uid ?? process.getuid?.() ?? 501;
    // Boot out first so reinstalling is idempotent. A missing old job is fine.
    try {
      run('launchctl', ['bootout', `gui/${uid}/${LABEL}`]);
    } catch {
      // Not currently loaded.
    }
    commands.push({ file: 'launchctl', args: ['bootstrap', `gui/${uid}`, file] });
    run('launchctl', ['bootstrap', `gui/${uid}`, file]);
  } else if (platform === 'linux') {
    const [serviceFile, timerFile] = paths.files as [string, string];
    writeFile(
      serviceFile,
      systemdService({
        nodePath: options.nodePath,
        cliPath: options.cliPath,
        intervalHours,
        careerStrikeHome: options.careerStrikeHome ?? null,
      }),
    );
    writeFile(timerFile, systemdTimer(intervalHours));
    commands.push({ file: 'systemctl', args: ['--user', 'daemon-reload'] });
    commands.push({ file: 'systemctl', args: ['--user', 'enable', '--now', 'career-strike-discovery.timer'] });
    run('systemctl', ['--user', 'daemon-reload']);
    run('systemctl', ['--user', 'enable', '--now', 'career-strike-discovery.timer']);
  } else {
    const task = `"${options.nodePath}" "${options.cliPath}" run-scheduled --interval ${intervalHours}`;
    const args = [
      '/Create',
      '/F',
      '/SC',
      'HOURLY',
      '/MO',
      String(intervalHours),
      '/TN',
      paths.windowsTask,
      '/TR',
      task,
    ];
    commands.push({ file: 'schtasks', args });
    run('schtasks', args);
  }

  return { platform, files: paths.files, commands, intervalHours };
}

export function scheduleStatus(options: { platform?: SchedulePlatform; homedir?: string } = {}): ScheduleStatus {
  const platform = platformOf(options.platform);
  const homedir = options.homedir ?? os.homedir();
  const paths = schedulePaths(platform, homedir);
  if (platform === 'win32') {
    // A file check cannot see Task Scheduler; report the task name for `schtasks /Query`.
    return {
      platform,
      installed: false,
      files: [],
      intervalHours: null,
      detail: `Check the Windows task with: schtasks /Query /TN ${paths.windowsTask}`,
    };
  }
  const files = paths.files.map((file) => ({ path: file, exists: fs.existsSync(file) }));
  const installed = files.every((file) => file.exists);
  let intervalHours: number | null = null;
  const source = platform === 'darwin' ? paths.files[0] : paths.files[1];
  if (source && fs.existsSync(source)) {
    const text = fs.readFileSync(source, 'utf8');
    if (platform === 'darwin') {
      const match = /<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/.exec(text);
      intervalHours = match ? Number(match[1]) / 3600 : null;
    } else {
      const match = /OnCalendar=([^\n]+)/.exec(text);
      const value = match?.[1]?.trim();
      if (value === 'daily') intervalHours = 24;
      else {
        const step = /\/(\d+):00:00/.exec(value ?? '');
        intervalHours = step ? Number(step[1]) : 1;
      }
    }
  }
  return {
    platform,
    installed,
    files,
    intervalHours,
    detail: installed
      ? 'The OS schedule is installed. It runs discovery without the dashboard or service process.'
      : 'No OS schedule is installed. Run `career-strike schedule-install`.',
  };
}

export function uninstallSchedule(
  options: { platform?: SchedulePlatform; homedir?: string; uid?: number; run?: CommandRunner } = {},
): { platform: SchedulePlatform; removed: string[] } {
  const platform = platformOf(options.platform);
  const homedir = options.homedir ?? os.homedir();
  const run = options.run ?? defaultRun;
  const paths = schedulePaths(platform, homedir);
  if (platform === 'darwin') {
    const uid = options.uid ?? process.getuid?.() ?? 501;
    try {
      run('launchctl', ['bootout', `gui/${uid}/${LABEL}`]);
    } catch {
      // Already absent.
    }
  } else if (platform === 'linux') {
    try {
      run('systemctl', ['--user', 'disable', '--now', 'career-strike-discovery.timer']);
    } catch {
      // Already absent.
    }
    run('systemctl', ['--user', 'daemon-reload']);
  } else {
    try {
      run('schtasks', ['/Delete', '/F', '/TN', paths.windowsTask]);
    } catch {
      // Already absent.
    }
  }
  const removed: string[] = [];
  for (const file of paths.files) {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
      removed.push(file);
    }
  }
  return { platform, removed };
}
