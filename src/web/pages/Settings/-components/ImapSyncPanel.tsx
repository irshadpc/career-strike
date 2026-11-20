import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { ErrorPanel } from '../../../components/states';
import { Button } from '../../../components/ui/button';
import { useToast } from '../../../components/ui/toast';

interface ImapSettings {
  host: string;
  port: number;
  username: string;
  allowlist: string[];
  enabled: boolean;
  lastSyncAt: string | null;
}

interface Candidate {
  id: string;
  from: string | null;
  subject: string | null;
  detectedAt: string;
  status: string;
}

export function ImapSyncPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ImapSettings | null>(null);
  const [error, setError] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [draft, setDraft] = useState({ host: '', port: 993, username: '', password: '', allowlist: '' });

  const load = useCallback(async () => {
    try {
      const r = await api<{ settings: ImapSettings | null }>('/api/imap');
      setSettings(r.settings);
      if (r.settings) {
        setDraft({
          host: r.settings.host,
          port: r.settings.port,
          username: r.settings.username,
          password: '',
          allowlist: (r.settings.allowlist ?? []).join(', '),
        });
      }
      const c = await api<{ candidates: Candidate[] }>('/api/imap/candidates');
      setCandidates(c.candidates);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      await api('/api/imap', {
        method: 'PUT',
        body: {
          host: draft.host.trim(),
          port: draft.port,
          username: draft.username.trim(),
          password: draft.password.trim() || null,
          allowlist: draft.allowlist
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          enabled: settings?.enabled ?? false,
        },
      });
      toast({ variant: 'success', title: 'IMAP settings saved' });
      void load();
    } catch {
      toast({ variant: 'destructive', title: 'Could not save IMAP settings' });
    }
  };

  const toggle = async (enabled: boolean) => {
    if (!settings) return;
    await api('/api/imap', {
      method: 'PUT',
      body: { ...settings, allowlist: settings.allowlist, enabled },
    }).catch(() => {});
    void load();
  };

  if (error) return <ErrorPanel message="IMAP settings could not be loaded." onRetry={() => void load()} />;
  if (settings === null && !error && draft.host === '') {
    // still loading
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs mb-6" data-setting="imap.config">
      <h2 className="text-lg font-semibold tracking-tight text-foreground mb-2">Read-only inbox sync (IMAP)</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Optional, local-only. Polls an allowlisted set of ATS/employer domains over TLS (port 993) using read-only
        header fetches — your Gmail password never leaves this computer. Surfaces one-click confirmation cards.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <input
          value={draft.host}
          onChange={(e) => setDraft({ ...draft, host: e.target.value })}
          placeholder="IMAP host (e.g. imap.gmail.com)"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          type="number"
          value={draft.port}
          onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) })}
          placeholder="Port"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          value={draft.username}
          onChange={(e) => setDraft({ ...draft, username: e.target.value })}
          placeholder="Username"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          type="password"
          value={draft.password}
          onChange={(e) => setDraft({ ...draft, password: e.target.value })}
          placeholder="Password / app password"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>
      <input
        value={draft.allowlist}
        onChange={(e) => setDraft({ ...draft, allowlist: e.target.value })}
        placeholder="Allowed sender domains (comma-separated, e.g. greenhouse.io,lever.co)"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm mb-3"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()}>
          Save
        </Button>
        {settings && (
          <Button size="sm" variant="secondary" onClick={() => void toggle(!settings.enabled)}>
            {settings.enabled ? 'Disable sync' : 'Enable sync'}
          </Button>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold text-foreground">Pending confirmations</h3>
          {candidates.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-md bg-muted/20 border border-border/40 text-xs flex items-start justify-between gap-2"
            >
              <div>
                <p className="m-0 font-medium text-foreground">{c.subject ?? '(no subject)'}</p>
                <p className="m-0 text-muted-foreground">{c.from}</p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={async () => {
                    await api(`/api/imap/candidates/${c.id}/accept`, { method: 'POST' });
                    void load();
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={async () => {
                    await api(`/api/imap/candidates/${c.id}/dismiss`, { method: 'POST' });
                    void load();
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default ImapSyncPanel;
