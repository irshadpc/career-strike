import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { installSchedule, schedulePaths, scheduleStatus, uninstallSchedule } from '../../src/supervisor/os-schedule.js';
import { tempDir } from '../helpers.js';

const dirs: string[] = [];
const home = (): string => {
  const dir = tempDir('cs-schedule-');
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const options = (homedir: string, platform: 'darwin' | 'linux' | 'win32', calls: string[][]) => ({
  platform,
  homedir,
  nodePath: '/usr/bin/node',
  cliPath: '/opt/career-strike/dist/cli/index.js',
  intervalHours: 6,
  uid: 501,
  run: (file: string, args: readonly string[]) => calls.push([file, ...args]),
});

describe('OS-level scheduling', () => {
  it('writes an idempotent launchd job that runs while the dashboard is closed', () => {
    const homedir = home();
    const calls: string[][] = [];
    const result = installSchedule(options(homedir, 'darwin', calls));
    const file = schedulePaths('darwin', homedir).files[0]!;
    expect(result.files).toEqual([file]);
    const plist = fs.readFileSync(file, 'utf8');
    expect(plist).toContain('<string>run-scheduled</string>');
    expect(plist).toContain('<key>StartInterval</key><integer>21600</integer>');
    expect(plist).toContain('/opt/career-strike/dist/cli/index.js');
    expect(plist).not.toContain('dashboard');
    expect(calls.some((call) => call[0] === 'launchctl' && call[1] === 'bootstrap')).toBe(true);

    const status = scheduleStatus({ platform: 'darwin', homedir });
    expect(status).toMatchObject({ installed: true, intervalHours: 6 });

    const removed = uninstallSchedule({
      platform: 'darwin',
      homedir,
      uid: 501,
      run: (file, args) => calls.push([file, ...args]),
    });
    expect(removed.removed).toEqual([file]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('writes a systemd user service and timer with the requested interval', () => {
    const homedir = home();
    const calls: string[][] = [];
    installSchedule({ ...options(homedir, 'linux', calls), intervalHours: 12 });
    const files = schedulePaths('linux', homedir).files;
    const service = fs.readFileSync(files[0]!, 'utf8');
    const timer = fs.readFileSync(files[1]!, 'utf8');
    expect(service).toContain(
      'ExecStart="/usr/bin/node" "/opt/career-strike/dist/cli/index.js" run-scheduled --interval 12',
    );
    expect(timer).toContain('OnCalendar=*-*-* 00/12:00:00');
    expect(timer).toContain('Persistent=true');
    expect(calls).toContainEqual(['systemctl', '--user', 'enable', '--now', 'career-strike-discovery.timer']);
    expect(scheduleStatus({ platform: 'linux', homedir })).toMatchObject({ installed: true, intervalHours: 12 });
  });

  it('creates a Windows scheduled task without pretending a file check proves it', () => {
    const homedir = home();
    const calls: string[][] = [];
    installSchedule(options(homedir, 'win32', calls));
    expect(calls[0]).toContain('schtasks');
    expect(calls[0]).toContain('/Create');
    expect(calls[0]).toContain('CareerStrikeDiscovery');
    const status = scheduleStatus({ platform: 'win32', homedir });
    expect(status.installed).toBe(false);
    expect(status.detail).toContain('schtasks /Query');
  });

  it('refuses an unsafe interval and an unsupported platform', () => {
    expect(() => installSchedule({ ...options(home(), 'darwin', []), intervalHours: 0 })).toThrow('between 1 and 168');
    expect(() => installSchedule({ ...options(home(), 'darwin', []), platform: 'aix' as unknown as 'darwin' })).toThrow(
      'not supported',
    );
  });
});
