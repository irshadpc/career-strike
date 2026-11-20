import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../components/ui/toast';

interface Contact {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  source: string;
  lastContactAt: string | null;
  notes: string | null;
  createdAt: string;
}

export function Contacts() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [warmCompany, setWarmCompany] = useState('');
  const [warmResults, setWarmResults] = useState<Contact[]>([]);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [draftTone, setDraftTone] = useState<'close_peer' | 'dormant' | 'hiring_manager'>('close_peer');
  const [draftContact, setDraftContact] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ contacts: Contact[] }>('/api/contacts');
      setContacts(r.contacts);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    try {
      await api('/api/contacts', {
        method: 'POST',
        body: {
          name,
          company: String(fd.get('company') ?? '').trim() || null,
          title: String(fd.get('title') ?? '').trim() || null,
          email: String(fd.get('email') ?? '').trim() || null,
          linkedinUrl: String(fd.get('linkedinUrl') ?? '').trim() || null,
          notes: String(fd.get('notes') ?? '').trim() || null,
        },
      });
      form.reset();
      toast({ variant: 'success', title: 'Contact added', description: name });
      void load();
    } catch {
      toast({ variant: 'destructive', title: 'Could not add contact' });
    }
  };

  const importCsv = async () => {
    if (!csvText.trim()) return;
    setImporting(true);
    try {
      const r = await api<{ imported: number }>('/api/contacts/import-csv', {
        method: 'POST',
        body: { csv: csvText },
      });
      toast({
        variant: 'success',
        title: `${r.imported} contacts imported`,
        description: 'From your LinkedIn export.',
      });
      setCsvText('');
      void load();
    } catch {
      toast({ variant: 'destructive', title: 'Import failed', description: 'Check the CSV format.' });
    } finally {
      setImporting(false);
    }
  };

  const findWarmPaths = async () => {
    if (!warmCompany.trim()) return;
    try {
      const r = await api<{ contacts: Contact[] }>(
        `/api/contacts/warm-paths?company=${encodeURIComponent(warmCompany)}`,
      );
      setWarmResults(r.contacts);
    } catch {
      setWarmResults([]);
    }
  };

  const filtered = (contacts ?? []).filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company ?? '').toLowerCase().includes(q) ||
      (c.title ?? '').toLowerCase().includes(q)
    );
  });

  const draftText = draftContact ? draftFor(draftContact, draftTone) : '';

  return (
    <div>
      <PageHeader
        eyebrow="Warm-path referral engine"
        title="Your career network"
        lede="Relationships convert 11× better than cold applications. Keep a private, local-first CRM of the people who can open doors."
      />
      {error && <ErrorPanel message="Contacts could not be loaded." onRetry={() => void load()} />}
      {!contacts && !error && <Loading label="Loading your network" />}

      {contacts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            {/* Warm paths */}
            <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
              <h2 className="text-base font-bold text-foreground m-0">Warm paths</h2>
              <p className="text-xs text-muted-foreground m-0">
                The moment you clip a role, check who you already know at that company.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={warmCompany}
                  onChange={(e) => setWarmCompany(e.target.value)}
                  placeholder="Company name (e.g. Acme Corp)"
                  className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                />
                <Button size="sm" onClick={() => void findWarmPaths()}>
                  Find paths
                </Button>
              </div>
              {warmResults.length > 0 && (
                <ul className="space-y-2 p-0 m-0 list-none">
                  {warmResults.map((c) => (
                    <li key={c.id} className="p-3 rounded-md bg-teal-500/5 border border-teal-500/30 text-xs">
                      <strong className="text-foreground">{c.name}</strong>
                      {c.title && <span className="text-muted-foreground"> · {c.title}</span>}
                      {c.company && <span className="text-muted-foreground"> @ {c.company}</span>}
                      {c.lastContactAt && (
                        <span className="block text-muted-foreground mt-0.5">Last contact: {c.lastContactAt}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {warmCompany && warmResults.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No contacts at this company yet. Add one below.</p>
              )}
            </section>

            {/* Contact list */}
            <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-base font-bold text-foreground m-0">Contacts ({filtered.length})</h2>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, company, title"
                  className="h-8 w-48 rounded-md border border-input bg-background px-3 text-xs"
                />
              </div>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No contacts yet.</p>
              ) : (
                <ul className="divide-y divide-border/60 text-sm">
                  {filtered.map((c) => (
                    <li key={c.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="m-0 font-medium text-foreground">{c.name}</p>
                        <p className="m-0 text-xs text-muted-foreground">
                          {[c.title, c.company].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {c.email && <p className="m-0 text-xs text-muted-foreground">{c.email}</p>}
                        {c.lastContactAt && (
                          <p className="m-0 text-[10px] text-muted-foreground">Last contact {c.lastContactAt}</p>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setDraftContact(c)}>
                          Draft outreach
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-muted-foreground"
                          onClick={async () => {
                            await api(`/api/contacts/${c.id}`, { method: 'DELETE' }).catch(() => {});
                            void load();
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-6">
            {/* Add contact */}
            <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
              <h2 className="text-base font-bold text-foreground m-0">Add a contact</h2>
              <form onSubmit={(e) => void addContact(e)} className="space-y-2">
                <input
                  name="name"
                  required
                  placeholder="Name"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <input
                  name="title"
                  placeholder="Title"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <input
                  name="company"
                  placeholder="Company"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Email"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <input
                  name="linkedinUrl"
                  type="url"
                  placeholder="LinkedIn URL"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <textarea
                  name="notes"
                  placeholder="Notes"
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <Button type="submit" size="sm" className="w-full">
                  Add contact
                </Button>
              </form>
            </section>

            {/* CSV import */}
            <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
              <h2 className="text-base font-bold text-foreground m-0">Import LinkedIn connections</h2>
              <p className="text-xs text-muted-foreground m-0">
                Drop in your official LinkedIn Connections CSV export (Settings → Data Privacy → Get a copy of your
                data). No cloud scraping — everything stays on this computer.
              </p>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={4}
                placeholder="First Name,Last Name,Company,Position,Email Address,URL,Connected On"
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={importing || !csvText.trim()}
                onClick={() => void importCsv()}
              >
                {importing ? 'Importing…' : 'Import CSV'}
              </Button>
            </section>

            {/* Outreach drafts */}
            {draftContact && (
              <section className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-foreground m-0">Outreach draft</h2>
                  <Button size="sm" variant="ghost" onClick={() => setDraftContact(null)}>
                    Close
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground m-0">
                  For {draftContact.name}
                  {draftContact.company ? ` @ ${draftContact.company}` : ''}.
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {(['close_peer', 'dormant', 'hiring_manager'] as const).map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={draftTone === t ? 'default' : 'outline'}
                      className="text-xs"
                      onClick={() => setDraftTone(t)}
                    >
                      {t === 'close_peer' ? 'Close peer' : t === 'dormant' ? 'Dormant acquaintance' : 'Hiring manager'}
                    </Button>
                  ))}
                </div>
                <Textarea value={draftText} readOnly rows={6} className="text-xs" />
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard?.writeText(draftText).catch(() => {});
                    toast({ variant: 'success', title: 'Copied to clipboard' });
                  }}
                >
                  Copy draft
                </Button>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function draftFor(c: Contact, tone: 'close_peer' | 'dormant' | 'hiring_manager'): string {
  const name = c.name.split(' ')[0] ?? c.name;
  const company = c.company ?? 'your team';
  if (tone === 'close_peer') {
    return `Hi ${name},\n\nHope you're doing well! I'm exploring roles in ${company}'s space and saw an opening that looks like a strong fit for my background. Given our overlap, would you be open to a 15-minute chat about the team and how hiring works there? No pressure either way.\n\nThanks,\n[Your name]`;
  }
  if (tone === 'dormant') {
    return `Hi ${name},\n\nIt's been a while — hope everything's going well at ${company}. I'm currently exploring new opportunities and noticed a role on your team that aligns with my experience. If you have a moment, I'd value your perspective on the team and whether a referral might make sense. Either way, great to reconnect.\n\nBest,\n[Your name]`;
  }
  return `Hi ${name},\n\nI'm reaching out because I'm very interested in the open role on your team at ${company}. My background in ${c.title ?? 'this area'} maps closely to what you're hiring for, and I'd welcome the chance to share how I could contribute. Would you be open to a brief conversation, or to pointing me toward the right person on the hiring team?\n\nThank you for your time,\n[Your name]`;
}

export default Contacts;
